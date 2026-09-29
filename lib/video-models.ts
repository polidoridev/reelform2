import { resolvePromptReferences } from "./prompt-references";

export type VideoResolution = "480p" | "720p" | "1080p";
// Output shapes offered when there is no source video to follow.
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type VideoModel = {
  id: string; name: string; shortName?: string; endpoint: string;
  kind: "seedance-edit" | "seedance-reference" | "kling-edit" | "kling-reference" | "motion" | "genjutsu";
  resolutions: VideoResolution[]; maxSeconds: number; minImages: number; maxImages: number;
  /** Whether a source video is required. "optional" models can also create from a prompt and photos. */
  video: "required" | "optional";
  /** Used when there is no video and no photo. */
  textEndpoint?: string;
  /** Seedance bills less per token when a video is supplied; these are the rates without one. */
  noVideoTokenRate?: number; noVideoRates?: Partial<Record<VideoResolution, number>>;
  audio: boolean; description: string;
  /** What the model is best at, shown in the model list. */
  bestFor: string;
  /** Per-1,000-token or per-second provider rate; `rates` overrides it for specific resolutions. */
  tokenRate?: number; secondRate?: number; rates?: Partial<Record<VideoResolution, number>>;
  /** One of the two one-click choices in the studio. */
  featured?: boolean;
};
// Ordered by how well each fits Reelform's footage-transformation use case: the
// two featured Genjutsu models first, then the rest ranked. Editorial, not a benchmark.
// Schemas and undiscounted prices checked against Higgsfield model docs and schema
// validation on 2026-09-27.
export const VIDEO_MODELS: VideoModel[] = [
  {id:"genjutsu-motion",name:"Genjutsu Motion Transfer",shortName:"Motion Transfer",endpoint:"higgsfield/genjutsu/motion-transfer/v1.0",kind:"genjutsu",video:"required",resolutions:["720p","480p","1080p"],maxSeconds:30,minImages:1,maxImages:4,audio:false,secondRate:0.681,rates:{"480p":0.318,"1080p":1.632},featured:true,description:"Recast your footage with characters, places, or styles from your photos while keeping its motion, camera movement, and timing. At least one photo required.",bestFor:"Putting a new character, outfit, or style into your clip while keeping every movement and camera move. Works best with your own footage and photos of yourself or original characters."},
  {id:"genjutsu-object",name:"Genjutsu Object Swap",shortName:"Object Swap",endpoint:"higgsfield/genjutsu/object-swap/v1.0",kind:"genjutsu",video:"required",resolutions:["720p","480p","1080p"],maxSeconds:30,minImages:1,maxImages:4,audio:false,secondRate:0.681,rates:{"480p":0.318,"1080p":1.632},featured:true,description:"Replace cars, clothing, products, or other objects using at least one reference photo. Up to 30 seconds.",bestFor:"Swapping one specific thing, like a car, product, piece of furniture, or outfit, for the one in your photo while the rest of the shot stays the same."},
  {id:"seedance-2.5-reference",name:"Seedance 2.5 Create",endpoint:"bytedance/seedance-2.5/reference-to-video",textEndpoint:"bytedance/seedance-2.5/text-to-video",kind:"seedance-reference",video:"optional",resolutions:["720p","480p","1080p"],maxSeconds:30,minImages:0,maxImages:4,audio:true,tokenRate:0.01284,rates:{"1080p":0.01404},noVideoTokenRate:0.0214,noVideoRates:{"1080p":0.0234},description:"Create a new video from a prompt. Add photos or a clip to guide it, or start from words alone. Up to 30 seconds; duration rounds up to whole seconds.",bestFor:"Making a brand-new video from a description, with or without photos or a clip for inspiration. Up to 30 seconds in 1080p, with generated sound."},
  {id:"seedance-2.5-edit",name:"Seedance 2.5 Edit",endpoint:"bytedance/seedance-2.5/video-edit",kind:"seedance-edit",video:"required",resolutions:["720p","480p","1080p"],maxSeconds:30,minImages:0,maxImages:4,audio:true,tokenRate:0.01284,rates:{"1080p":0.01404},description:"Change scenes, clothes, and surroundings while following your footage. Up to 30 seconds.",bestFor:"Broad changes described in words, like a new location, weather, time of day, or wardrobe, on clips up to 30 seconds. Photos are optional, and it can generate new sound."},
  {id:"kling-o3-edit",name:"Kling O3 Edit",endpoint:"kling-video/o3/video-edit",kind:"kling-edit",video:"required",resolutions:["1080p","720p"],maxSeconds:10,minImages:0,maxImages:4,audio:false,secondRate:0.126,description:"Detailed scene editing with optional reference photos. Pro mode for 1080p; use clips up to 10 seconds.",bestFor:"Precise, detailed edits to short clips (up to 10 seconds) in sharp 1080p, such as changing a single element exactly as described."},
  {id:"kling-3-motion-pro",name:"Kling 3.0 Motion Pro",endpoint:"kling-video/v3/motion-control/pro",kind:"motion",video:"required",resolutions:["1080p"],maxSeconds:30,minImages:1,maxImages:1,audio:false,secondRate:0.168,description:"Animate one reference photo with your video's movement in 1080p. This transfers motion rather than editing individual objects.",bestFor:"Making one character photo perform the movement in your video, in 1080p. Everything in the result comes from the photo, not the original scene."},
  {id:"seedance-2-reference",name:"Seedance 2.0 Create",endpoint:"bytedance/seedance-2.0/reference-to-video",textEndpoint:"bytedance/seedance-2.0/text-to-video",kind:"seedance-reference",video:"optional",resolutions:["1080p","720p","480p"],maxSeconds:15,minImages:0,maxImages:4,audio:true,tokenRate:0.0084,noVideoTokenRate:0.014,description:"Create a new video from a prompt, optionally guided by photos or a clip, up to 1080p and 15 seconds. Duration rounds up to whole seconds.",bestFor:"A lower-cost way to make a new video from a description, photos, or a clip, up to 15 seconds in 1080p."},
  {id:"kling-omni-edit",name:"Kling Omni Edit",endpoint:"kling-video/omni/video-edit",kind:"kling-edit",video:"required",resolutions:["1080p","720p"],maxSeconds:10,minImages:0,maxImages:4,audio:false,secondRate:0.126,description:"Prompt-guided edits with optional photos. Pro mode for 1080p; use clips up to 10 seconds.",bestFor:"An alternative to Kling O3 Edit for described edits on clips up to 10 seconds. Worth trying when O3’s result isn’t quite right."},
  {id:"kling-o3-reference",name:"Kling O3 Reference",endpoint:"kling-video/o3/video-reference",kind:"kling-reference",video:"required",resolutions:["1080p","720p"],maxSeconds:10,minImages:0,maxImages:4,audio:false,secondRate:0.168,description:"Create a new shot inspired by your video, up to 10 seconds. Output duration rounds up to whole seconds.",bestFor:"Short new shots (up to 10 seconds) that borrow the style and subject of your clip rather than editing it."},
  {id:"kling-omni-reference",name:"Kling Omni Reference",endpoint:"kling-video/omni/video-reference",kind:"kling-reference",video:"required",resolutions:["1080p","720p"],maxSeconds:10,minImages:0,maxImages:4,audio:false,secondRate:0.168,description:"Reference-guided new scenes up to 10 seconds. Output duration rounds up to whole seconds.",bestFor:"An alternative to Kling O3 Reference for short new shots inspired by your clip."},
  {id:"kling-3-motion-std",name:"Kling 3.0 Motion Standard",endpoint:"kling-video/v3/motion-control/std",kind:"motion",video:"required",resolutions:["720p"],maxSeconds:30,minImages:1,maxImages:1,audio:false,secondRate:0.126,description:"Transfer your video's movement to one reference photo at 720p.",bestFor:"The same one-photo animation as Motion Pro at 720p, for less."},
  {id:"kling-2.6-motion-pro",name:"Kling 2.6 Motion Pro",endpoint:"kling-video/motion-control/pro",kind:"motion",video:"required",resolutions:["1080p"],maxSeconds:30,minImages:1,maxImages:1,audio:false,secondRate:0.112,description:"Animate one reference photo from your video's movement at 1080p.",bestFor:"The previous-generation 1080p one-photo animation. Cheaper than 3.0 Motion Pro, with less natural movement."},
  {id:"kling-2.6-motion-std",name:"Kling 2.6 Motion Standard",endpoint:"kling-video/motion-control/std",kind:"motion",video:"required",resolutions:["720p"],maxSeconds:30,minImages:1,maxImages:1,audio:false,secondRate:0.07,description:"A lower-cost option for transferring motion to one reference photo at 720p.",bestFor:"The lowest-cost way to animate one photo with your video’s movement, at 720p. Good for quick drafts."},
];
export const FEATURED_VIDEO_MODELS = VIDEO_MODELS.filter((m) => m.featured);
export const DEFAULT_VIDEO_MODEL = "genjutsu-object";
export function getVideoModel(id: string): VideoModel {
  const model = VIDEO_MODELS.find(m => m.id === id);
  if (!model) throw new Error("Choose a supported video model.");
  return model;
}
/** Highest quality the model offers, skipping 1080p when the plan can't use it (unless the model offers nothing lower). */
export function bestResolution(model: VideoModel, fullHd = true): VideoResolution {
  const sorted = [...model.resolutions].sort((a, b) => parseInt(b) - parseInt(a));
  return sorted.find(r => fullHd || r !== "1080p") ?? sorted[0];
}
/** Provider rate for this resolution: per second when the model bills by the second, else per 1,000 tokens. */
export function modelRate(model: VideoModel, resolution: VideoResolution, hasVideo = true) {
  if (!hasVideo && model.noVideoTokenRate !== undefined) return model.noVideoRates?.[resolution] ?? model.noVideoTokenRate;
  return model.rates?.[resolution] ?? model.secondRate ?? model.tokenRate!;
}
export function modelEndpoint(model: VideoModel, input: { hasVideo: boolean; imageCount: number }) {
  return !input.hasVideo && !input.imageCount && model.textEndpoint ? model.textEndpoint : model.endpoint;
}
export function validateModel(model: VideoModel, resolution: string, seconds: number, imageCount?: number, audio?: boolean, hasVideo = true) {
  if (!hasVideo && model.video === "required") throw new Error(`${model.name} transforms a video you upload. Add a video, or choose Seedance 2.5 Create to start from a prompt.`);
  if (!model.resolutions.includes(resolution as VideoResolution)) throw new Error(`${model.name} does not support ${resolution}. Choose an available quality.`);
  if (seconds < 4 || seconds > model.maxSeconds) throw new Error(`${model.name} supports clips between 4 and ${model.maxSeconds} seconds in Reelform. Choose Seedance 2.5 Edit for longer edits.`);
  if (imageCount !== undefined && (imageCount < model.minImages || imageCount > model.maxImages)) throw new Error(`${model.name} needs ${model.minImages === model.maxImages ? `exactly ${model.minImages}` : `${model.minImages}–${model.maxImages}`} reference photos.`);
  if (audio && !model.audio) throw new Error(`${model.name} does not support generated audio. Select Original audio.`);
}
export function modelRequest(model: VideoModel, input: {prompt:string;videoUrl:string|null;imageUrls:string[];resolution:string;generateAudio:boolean;media:{duration:number;width:number;height:number};aspectRatio?:AspectRatio}): Record<string, unknown> {
  const {videoUrl,imageUrls,resolution,generateAudio,media}=input;
  validateModel(model,resolution,media.duration,imageUrls.length,generateAudio,!!videoUrl);
  // @video / @image1 mentions are checked and rewritten for the provider here, so the
  // stored prompt keeps the person's own wording and retries rewrite it the same way.
  const prompt=resolvePromptReferences(input.prompt,imageUrls.length,!!videoUrl);
  const images=imageUrls.length?{image_urls:imageUrls}:{};
  // Without a video, Seedance creates at the chosen shape and length (text-to-video when
  // there are no photos either; reference-to-video with only photos otherwise).
  if(!videoUrl)return {prompt,...images,resolution,generate_audio:generateAudio,duration:Math.ceil(media.duration),aspect_ratio:input.aspectRatio??"16:9",...(model.id.startsWith("seedance-2.5")?{bitrate_mode:"standard"}:{})};
  const aspect=media.width/media.height > 1.2 ? "16:9" : media.height/media.width > 1.2 ? "9:16" : "1:1";
  if(model.kind==="motion")return {prompt,video_url:videoUrl,image_url:imageUrls[0],character_orientation:"video",keep_original_sound:"no"};
  if(model.kind==="genjutsu")return {prompt,video_url:videoUrl,image_urls:imageUrls,resolution};
  if(model.kind.startsWith("kling"))return {prompt,video_urls:[videoUrl],...images,mode:resolution==="1080p"?"pro":"std",...(model.kind==="kling-reference"?{duration:Math.ceil(media.duration),aspect_ratio:aspect}:{})};
  return {prompt,...images,resolution,generate_audio:generateAudio,...(model.kind==="seedance-edit"?{video_url:videoUrl}:{video_urls:[videoUrl],duration:Math.ceil(media.duration),aspect_ratio:aspect}),...(model.id.startsWith("seedance-2.5")?{bitrate_mode:"standard"}:{})};
}
