// class AudioStreamPlayer extends AudioWorkletProcessor {
//     constructor() {
//         super();
//         // 定义较大的缓冲区，采用循环缓冲区
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
//         // 使用循环缓冲区依次写入数据
//         for (let i = 0; i < data.length; i++) {
//             let nextWrite = (this.writeIndex + 1) % this.bufferSize;
//             // 如果即将写入会覆盖未读数据，则认为缓冲区满，并记录警告
//             if (nextWrite === this.readIndex) {
//                 console.warn('[Processor] Buffer overflow in circular buffer.');
//                 break; // 可以选择直接丢弃当前数据或覆盖旧数据，这里选择丢弃后续部分
//             }
//             this.buffer[this.writeIndex] = data[i];
//             this.writeIndex = nextWrite;
//         }
//     }

//     process(_, outputs) {
//         const output = outputs[0][0];
//         const samplesNeeded = output.length;
//         // 计算环形缓冲区中实际可用的样本数量
//         let available =
//             this.writeIndex >= this.readIndex
//                 ? this.writeIndex - this.readIndex
//                 : this.bufferSize - this.readIndex + this.writeIndex;

//         if (this.stopped) {
//             // 停止时，平滑过渡：这里简单填充为 0（可进一步扩展为渐弱淡出）
//             output.fill(0);
//             return true;
//         }

//         if (available >= samplesNeeded) {
//             // 有足够数据时连续输出
//             for (let i = 0; i < samplesNeeded; i++) {
//                 output[i] = this.buffer[this.readIndex];
//                 this.readIndex = (this.readIndex + 1) % this.bufferSize;
//             }
//         } else if (available > 0) {
//             // 数据不足时，输出所有可用数据，并对尾部做渐弱过渡，避免突变
//             let lastSample = 0;
//             for (let i = 0; i < available; i++) {
//                 output[i] = this.buffer[this.readIndex];
//                 lastSample = this.buffer[this.readIndex];
//                 this.readIndex = (this.readIndex + 1) % this.bufferSize;
//             }
//             // 对不足部分进行线性淡出，平滑衔接
//             for (let i = available; i < samplesNeeded; i++) {
//                 let fade = lastSample * (1 - (i - available) / (samplesNeeded - available));
//                 output[i] = fade;
//             }
//         } else {
//             // 无数据可用时，输出静音
//             output.fill(0);
//         }

//         if (this.finished && available === 0) {
//             this.port.postMessage({ type: 'ended' });
//             this.finished = false;
//         }

//         return true;
//     }
// }

// registerProcessor('audio-stream-player', AudioStreamPlayer);
