export type VideoResolution = "480p" | "720p" | "1080p";
export type VideoModel = {
  id: string; name: string; endpoint: string;
  kind: "seedance-edit" | "seedance-reference" | "kling-edit" | "kling-reference" | "motion" | "genjutsu";
  resolutions: VideoResolution[]; maxSeconds: number; minImages: number; maxImages: number;
  audio: boolean; description: string; tokenRate?: number; secondRate?: number; recommended?: boolean;
};
// Ordered recommendations for Reelform's footage-transformation use case, not a benchmark ranking.
// Schemas and undiscounted prices checked against Higgsfield model docs on 2026-09-20.
export const VIDEO_MODELS: VideoModel[] = [
  {id:"seedance-2.5-edit",name:"Seedance 2.5 Edit",endpoint:"bytedance/seedance-2.5/video-edit",kind:"seedance-edit",resolutions:["720p","480p"],maxSeconds:30,minImages:0,maxImages:4,audio:true,tokenRate:0.01284,recommended:true,description:"Recommended overall for changing scenes, clothes, and surroundings while following your footage. Up to 30 seconds."},
  {id:"kling-o3-edit",name:"Kling O3 Edit",endpoint:"kling-video/o3/video-edit",kind:"kling-edit",resolutions:["1080p","720p"],maxSeconds:10,minImages:0,maxImages:4,audio:false,secondRate:0.126,recommended:true,description:"Detailed scene editing with optional reference photos. Pro mode for 1080p; use clips up to 10 seconds."},
  {id:"genjutsu-object",name:"Genjutsu Object Swap",endpoint:"higgsfiled/genjutsu/object-swap/v1.0",kind:"genjutsu",resolutions:["720p","480p"],maxSeconds:30,minImages:1,maxImages:4,audio:false,recommended:true,description:"Replace cars, clothing, or other objects using at least one reference photo. Up to 30 seconds."},
  {id:"genjutsu-motion",name:"Genjutsu Motion Transfer",endpoint:"higgsfiled/genjutsu/motion-transfer/v1.0",kind:"genjutsu",resolutions:["720p","480p"],maxSeconds:30,minImages:1,maxImages:4,audio:false,recommended:true,description:"Reimagine your footage using reference photos while transferring its motion. At least one photo required."},
  {id:"kling-3-motion-pro",name:"Kling 3.0 Motion Pro",endpoint:"kling-video/v3/motion-control/pro",kind:"motion",resolutions:["1080p"],maxSeconds:30,minImages:1,maxImages:1,audio:false,secondRate:0.168,recommended:true,description:"Animate one reference photo with your video's movement in 1080p. This transfers motion rather than editing individual objects."},
  {id:"seedance-2-reference",name:"Seedance 2.0 Reference",endpoint:"bytedance/seedance-2.0/reference-to-video",kind:"seedance-reference",resolutions:["1080p","720p","480p"],maxSeconds:15,minImages:0,maxImages:4,audio:true,tokenRate:0.0084,description:"Generate a new scene from your video and photos, up to 1080p and 15 seconds. Motion and timing may change; duration rounds up to whole seconds."},
  {id:"seedance-2.5-reference",name:"Seedance 2.5 Reference",endpoint:"bytedance/seedance-2.5/reference-to-video",kind:"seedance-reference",resolutions:["720p","480p"],maxSeconds:30,minImages:0,maxImages:4,audio:true,tokenRate:0.01284,description:"Create a new scene inspired by your video and photos. Up to 30 seconds; timing may change and duration rounds up to whole seconds."},
  {id:"kling-omni-edit",name:"Kling Omni Edit",endpoint:"kling-video/omni/video-edit",kind:"kling-edit",resolutions:["1080p","720p"],maxSeconds:10,minImages:0,maxImages:4,audio:false,secondRate:0.126,description:"Prompt-guided edits with optional photos. Pro mode for 1080p; use clips up to 10 seconds."},
  {id:"kling-o3-reference",name:"Kling O3 Reference",endpoint:"kling-video/o3/video-reference",kind:"kling-reference",resolutions:["1080p","720p"],maxSeconds:10,minImages:0,maxImages:4,audio:false,secondRate:0.168,description:"Create a new shot inspired by your video, up to 10 seconds. Output duration rounds up to whole seconds."},
  {id:"kling-omni-reference",name:"Kling Omni Reference",endpoint:"kling-video/omni/video-reference",kind:"kling-reference",resolutions:["1080p","720p"],maxSeconds:10,minImages:0,maxImages:4,audio:false,secondRate:0.168,description:"Reference-guided new scenes up to 10 seconds. Output duration rounds up to whole seconds."},
  {id:"kling-3-motion-std",name:"Kling 3.0 Motion Standard",endpoint:"kling-video/v3/motion-control/std",kind:"motion",resolutions:["720p"],maxSeconds:30,minImages:1,maxImages:1,audio:false,secondRate:0.126,description:"Transfer your video's movement to one reference photo at 720p."},
  {id:"kling-2.6-motion-pro",name:"Kling 2.6 Motion Pro",endpoint:"kling-video/motion-control/pro",kind:"motion",resolutions:["1080p"],maxSeconds:30,minImages:1,maxImages:1,audio:false,secondRate:0.112,description:"Animate one reference photo from your video's movement at 1080p."},
  {id:"kling-2.6-motion-std",name:"Kling 2.6 Motion Standard",endpoint:"kling-video/motion-control/std",kind:"motion",resolutions:["720p"],maxSeconds:30,minImages:1,maxImages:1,audio:false,secondRate:0.07,description:"A lower-cost option for transferring motion to one reference photo at 720p."},
];
export const DEFAULT_VIDEO_MODEL = VIDEO_MODELS[0].id;
export function getVideoModel(id: string): VideoModel {
  const model = VIDEO_MODELS.find(m => m.id === id);
  if (!model) throw new Error("Choose a supported video model.");
  return model;
}
export function validateModel(model: VideoModel, resolution: string, seconds: number, imageCount?: number, audio?: boolean) {
  if (!model.resolutions.includes(resolution as VideoResolution)) throw new Error(`${model.name} does not support ${resolution}. Choose an available quality.`);
  if (seconds < 4 || seconds > model.maxSeconds) throw new Error(`${model.name} supports clips between 4 and ${model.maxSeconds} seconds in Reelform. Choose Seedance 2.5 Edit for longer edits.`);
  if (imageCount !== undefined && (imageCount < model.minImages || imageCount > model.maxImages)) throw new Error(`${model.name} needs ${model.minImages === model.maxImages ? `exactly ${model.minImages}` : `${model.minImages}–${model.maxImages}`} reference photos.`);
  if (audio && !model.audio) throw new Error(`${model.name} does not support generated audio. Select Silent video.`);
}
export function modelRequest(model: VideoModel, input: {prompt:string;videoUrl:string;imageUrls:string[];resolution:string;generateAudio:boolean;media:{duration:number;width:number;height:number}}): Record<string, unknown> {
  validateModel(model,input.resolution,input.media.duration,input.imageUrls.length,input.generateAudio);
  const {prompt,videoUrl,imageUrls,resolution,generateAudio,media}=input;
  const images=imageUrls.length?{image_urls:imageUrls}:{};
  const aspect=media.width/media.height > 1.2 ? "16:9" : media.height/media.width > 1.2 ? "9:16" : "1:1";
  if(model.kind==="motion")return {prompt,video_url:videoUrl,image_url:imageUrls[0],character_orientation:"video",keep_original_sound:"no"};
  if(model.kind==="genjutsu")return {prompt,video_url:videoUrl,image_urls:imageUrls,resolution};
  if(model.kind.startsWith("kling"))return {prompt,video_urls:[videoUrl],...images,mode:resolution==="1080p"?"pro":"std",...(model.kind==="kling-reference"?{duration:Math.ceil(media.duration),aspect_ratio:aspect}:{})};
  return {prompt,...images,resolution,generate_audio:generateAudio,...(model.kind==="seedance-edit"?{video_url:videoUrl}:{video_urls:[videoUrl],duration:Math.ceil(media.duration),aspect_ratio:aspect}),...(model.id.startsWith("seedance-2.5")?{bitrate_mode:"standard"}:{})};
}
