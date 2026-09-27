import test from "node:test";
import assert from "node:assert/strict";
import {VIDEO_MODELS,FEATURED_VIDEO_MODELS,DEFAULT_VIDEO_MODEL,getVideoModel,modelRequest,validateModel} from "../lib/video-models";
import {quoteVideo} from "../lib/commerce/pricing";
const media={duration:8.2,width:1920,height:1080,bytes:2000};
const base={prompt:"Replace my car with a luxury sports car",videoUrl:"https://media.example/input.mp4",imageUrls:["https://media.example/car.jpg"],resolution:"720p",generateAudio:false,media};
test("all catalog models have a valid adapter and a positive, model-specific quote",()=>{
 for(const model of VIDEO_MODELS){
  const resolution=model.resolutions[0];
  assert.ok(quoteVideo(media,resolution,model.id).credits>0);
  const payload=modelRequest(model,{...base,resolution});
  assert.equal(payload.prompt,base.prompt);
 }
 assert.deepEqual(FEATURED_VIDEO_MODELS.map(m=>m.id),["genjutsu-motion","genjutsu-object"]);
 assert.ok(FEATURED_VIDEO_MODELS.some(m=>m.id===DEFAULT_VIDEO_MODEL));
 assert.ok(VIDEO_MODELS.every(m=>m.bestFor.length>20),"every model explains what it is best at");
});
test("1080p costs more for reference generation; unsupported 1080p cannot be silently downgraded",()=>{
 assert.ok(quoteVideo(media,"1080p","seedance-2-reference").credits>quoteVideo(media,"720p","seedance-2-reference").credits);
 assert.throws(()=>quoteVideo(media,"1080p","kling-3-motion-std"),/does not support/);
 assert.throws(()=>getVideoModel("forged-provider-endpoint"),/supported/);
});
test("adapters map quality to provider modes and motion images exactly",()=>{
 const edit=modelRequest(getVideoModel("kling-o3-edit"),{...base,resolution:"1080p"});
 assert.equal(edit.mode,"pro");assert.deepEqual(edit.video_urls,[base.videoUrl]);assert.equal("resolution" in edit,false);
 const motion=modelRequest(getVideoModel("kling-3-motion-pro"),{...base,resolution:"1080p"});
 assert.equal(motion.image_url,base.imageUrls[0]);assert.equal(motion.keep_original_sound,"no");
 const reference=modelRequest(getVideoModel("seedance-2-reference"),{...base,resolution:"1080p"});assert.equal(reference.duration,9);
});
test("duration, references and generated audio are validated before reservation",()=>{
 assert.throws(()=>validateModel(getVideoModel("kling-o3-edit"),"1080p",30),/between 4 and 10/);
 assert.throws(()=>validateModel(getVideoModel("kling-3-motion-pro"),"1080p",8,0),/exactly 1/);
 assert.throws(()=>validateModel(getVideoModel("kling-3-motion-pro"),"1080p",8,2),/exactly 1/);
 assert.throws(()=>validateModel(getVideoModel("genjutsu-object"),"720p",8,1,true),/does not support generated audio/);
 assert.doesNotThrow(()=>validateModel(getVideoModel("seedance-2.5-edit"),"720p",30,4,true));
});
test("Genjutsu and Seedance 2.5 offer 1080p at the published 1080p rates",()=>{
 // Genjutsu bills whole input seconds: 9 s × $1.632 at 1080p, × 360 credits per dollar.
 assert.equal(quoteVideo(media,"1080p","genjutsu-motion").estimatedProviderUsd,9*1.632);
 assert.equal(quoteVideo(media,"1080p","genjutsu-object").credits,Math.ceil(9*1.632*360/10)*10);
 assert.equal(quoteVideo(media,"720p","genjutsu-object").estimatedProviderUsd,9*0.681);
 assert.equal(quoteVideo(media,"480p","genjutsu-object").estimatedProviderUsd,9*0.318);
 for(const id of ["seedance-2.5-edit","seedance-2.5-reference"]){
  const hd=quoteVideo(media,"1080p",id),sd=quoteVideo(media,"720p",id);
  assert.ok(hd.credits>sd.credits);
  assert.equal(modelRequest(getVideoModel(id),{...base,resolution:"1080p"}).resolution,"1080p");
 }
 const genjutsu=modelRequest(getVideoModel("genjutsu-motion"),{...base,resolution:"1080p"});
 assert.equal(genjutsu.resolution,"1080p");
 assert.equal(getVideoModel("genjutsu-motion").endpoint,"higgsfield/genjutsu/motion-transfer/v1.0");
});
test("@mentions are rewritten for the provider and must match an attachment",()=>{
 const two={...base,imageUrls:["https://media.example/a.jpg","https://media.example/b.jpg"],prompt:"Put @Image2 on the man in @video, wearing @image1"};
 assert.equal(modelRequest(getVideoModel("genjutsu-motion"),two).prompt,"Put reference image 2 on the man in the input video, wearing reference image 1");
 assert.equal(modelRequest(getVideoModel("genjutsu-object"),{...base,prompt:"Swap the car in @video for @image1"}).prompt,"Swap the car in the input video for the reference image");
 assert.throws(()=>modelRequest(getVideoModel("genjutsu-object"),{...base,prompt:"Swap the car for @image2 please"}),/@image2 doesn’t match a photo/);
});
