import test from "node:test";
import assert from "node:assert/strict";
import {VIDEO_MODELS,getVideoModel,modelRequest,validateModel} from "../lib/video-models";
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
 assert.equal(VIDEO_MODELS.filter(m=>m.recommended).length,5);
});
test("1080p costs more for reference generation; unsupported 1080p cannot be silently downgraded",()=>{
 assert.ok(quoteVideo(media,"1080p","seedance-2-reference").credits>quoteVideo(media,"720p","seedance-2-reference").credits);
 assert.throws(()=>quoteVideo(media,"1080p","seedance-2.5-edit"),/does not support/);
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
