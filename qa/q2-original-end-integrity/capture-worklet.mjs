class Capture extends AudioWorkletProcessor {
 process(inputs) {const x=inputs[0];if(x?.length){const a=x.map(p=>p.slice());this.port.postMessage({frame:currentFrame,planes:a},a.map(p=>p.buffer));}return true;}
}
registerProcessor('capture',Capture);
