// class AudioStreamPlayer extends AudioWorkletProcessor {
//     constructor() {
//         super();
//         this.bufferSize = 48000 * 60 * 4; // 4 分钟缓冲空间
//         this.buffer = new Float32Array(this.bufferSize);
//         this.writeIndex = 0;
//         this.readIndex = 0;
//         this.stopped = false;
//         this.finished = false;

//         this.port.onmessage = ({ data }) => {
//             if (data.type === 'add') {
//                 const audioData = new Float32Array(data.audioData);
//                 this._write(audioData);
//             } else if (data.type === 'stop') {
//                 this.stopped = true;
//             } else if (data.type === 'clear') {
//                 this.writeIndex = 0;
//                 this.readIndex = 0;
//                 this.stopped = false;
//             } else if (data.type === 'finish') {
//                 this.finished = true;
//             }
//         };
//     }

//     _write(data) {
//         const available = this.bufferSize - this.writeIndex;
//         if (data.length > available) {
//             console.warn('[Processor] Buffer overflow — reset.');
//             this.writeIndex = 0;
//             this.readIndex = 0;
//         }
//         this.buffer.set(data, this.writeIndex);
//         this.writeIndex += data.length;
//     }

//     process(_, outputs) {
//         const output = outputs[0][0];
//         const samplesNeeded = output.length;
//         const available = this.writeIndex - this.readIndex;

//         if (this.stopped) {
//             output.fill(0);
//             return true;
//         }

//         if (available >= samplesNeeded) {
//             output.set(this.buffer.subarray(this.readIndex, this.readIndex + samplesNeeded));
//             this.readIndex += samplesNeeded;
//         } else if (available > 0) {
//             const slice = this.buffer.subarray(this.readIndex, this.writeIndex);
//             output.set(slice);
//             output.fill(0, available);
//             this.readIndex = this.writeIndex;
//         } else {
//             output.fill(0);
//             console.log('play none');
//         }

//         if (this.finished && this.readIndex >= this.writeIndex) {
//             this.port.postMessage({ type: 'ended' });
//             this.finished = false;
//             this.readIndex = 0;
//             this.writeIndex = 0;
//         }

//         return true;
//     }
// }

// registerProcessor('audio-stream-player', AudioStreamPlayer);
