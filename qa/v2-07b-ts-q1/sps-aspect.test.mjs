import test from 'node:test';
import assert from 'node:assert/strict';
import { parseH264Sps } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';
import { makeHigh720pBt709Sps } from '../v2-07a-container-probe/synthetic-mpeg-ts-fixtures.mjs';

const parse=options=>parseH264Sps(makeHigh720pBt709Sps(options));

test('missing VUI and missing aspect flag retain absence, never an invented square ratio',()=>{
  for(const vuiPresent of [false,true]){
    const result=parse({vuiPresent});
    assert.equal(result.status,'parsed');assert.equal(result.vuiPresent,vuiPresent);
    assert.deepEqual(result.aspectRatio,{status:'unspecified',present:false,idc:null,width:null,height:null});
    assert.equal(result.width,1280);assert.equal(result.height,720);
  }
});

test('all defined IDC ratios remain exact rational metadata, separate from coded dimensions',()=>{
  const expected=[[1,1],[12,11],[10,11],[16,11],[40,33],[24,11],[20,11],[32,11],
    [80,33],[18,11],[15,11],[64,33],[160,99],[4,3],[3,2],[2,1]];
  for(const [index,[width,height]] of expected.entries()){
    const result=parse({aspectRatioIdc:index+1});assert.equal(result.status,'parsed');
    assert.deepEqual(result.aspectRatio,{status:'explicit',present:true,idc:index+1,width,height});
    assert.equal(result.width,1280);assert.equal(result.height,720);
    assert.equal(result.color.matrix,'BT.709');
  }
});

test('IDC0 and zero-valued Extended SAR preserve unspecified semantics and their raw fields',()=>{
  assert.deepEqual(parse({aspectRatioIdc:0}).aspectRatio,{status:'unspecified',present:true,idc:0,width:null,height:null});
  for(const [sarWidth,sarHeight]of[[0,0],[0,1],[1,0]]){
    const result=parse({aspectRatioIdc:255,sarWidth,sarHeight});assert.equal(result.status,'parsed');
    assert.deepEqual(result.aspectRatio,{status:'unspecified',present:true,idc:255,width:sarWidth,height:sarHeight});
  }
});

test('extended ratios preserve full 16-bit values without normalization or overflow',()=>{
  for(const [sarWidth,sarHeight]of[[4,3],[65535,65534],[1,65535],[65535,1]]){
    const result=parse({aspectRatioIdc:255,sarWidth,sarHeight});assert.equal(result.status,'parsed');
    assert.deepEqual(result.aspectRatio,{status:'explicit',present:true,idc:255,width:sarWidth,height:sarHeight});
    assert.equal(result.width,1280);
  }
});

test('reserved IDC remains unknown, not square or an absence eligible for repair',()=>{
  for(const idc of [17,33,254]){
    const result=parse({aspectRatioIdc:idc});assert.equal(result.status,'parsed');
    assert.deepEqual(result.aspectRatio,{status:'reserved',present:true,idc,width:null,height:null});
  }
});

test('partial SPS never returns aspect metadata as validated, including after complete aspect fields',()=>{
  for(const options of [{},{vuiPresent:false},{aspectRatioIdc:255,sarWidth:65535,sarHeight:65534}]){
    const bytes=makeHigh720pBt709Sps(options);
    for(let length=0;length<bytes.length;length++){
      const result=parseH264Sps(bytes.subarray(0,length));
      assert.notEqual(result.status,'parsed');assert.equal(result.aspectRatio,undefined);
    }
  }
});

test('exported SPS reader has an explicit input bound and refuses non-byte inputs',()=>{
  for(const input of [null,{},[],new ArrayBuffer(8)])assert.deepEqual(parseH264Sps(input),{status:'malformed',code:'H264_SPS_INPUT_INVALID'});
  assert.deepEqual(parseH264Sps(new Uint8Array(65537)),{status:'incomplete',code:'H264_SPS_BYTE_LIMIT'});
});
