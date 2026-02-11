// class AudioStreamPlayer extends AudioWorkletProcessor {
//     constructor() {
//         super();
//         // 分配 4 分钟缓冲空间，采样率假设为 48000Hz
//         this.bufferSize = 48000 * 60 * 4;
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
//                 // 重置缓冲索引，清空暂停状态
//                 this.writeIndex = 0;
//                 this.readIndex = 0;
//                 this.stopped = false;
//             } else if (data.type === 'finish') {
//                 this.finished = true;
//             }
//         };
//     }

//     _write(data) {
//         // 将数据写入循环缓冲区
//         for (let i = 0; i < data.length; i++) {
//             this.buffer[this.writeIndex] = data[i];
//             this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
//             // 防止写入指针追上读取指针，避免覆盖未播放的数据
//             if (this.writeIndex === this.readIndex) {
//                 this.readIndex = (this.readIndex + 1) % this.bufferSize;
//             }
//         }
//     }

//     process(_, outputs) {
//         const output = outputs[0][0];
//         const samplesNeeded = output.length;
//         // 计算缓冲区内当前可用的样本数（循环缓冲区逻辑）
//         let available =
//             this.writeIndex >= this.readIndex
//                 ? this.writeIndex - this.readIndex
//                 : this.bufferSize - this.readIndex + this.writeIndex;

//         if (this.stopped) {
//             output.fill(0);
//             return true;
//         }

//         if (available >= samplesNeeded) {
//             // 如果连续空间足够，则一次性复制
//             if (this.readIndex + samplesNeeded <= this.bufferSize) {
//                 output.set(this.buffer.subarray(this.readIndex, this.readIndex + samplesNeeded));
//                 this.readIndex = (this.readIndex + samplesNeeded) % this.bufferSize;
//             } else {
//                 // 跨越缓冲区尾部：分两次复制
//                 const firstPart = this.buffer.subarray(this.readIndex, this.bufferSize);
//                 const secondPart = this.buffer.subarray(0, samplesNeeded - firstPart.length);
//                 output.set(firstPart);
//                 output.set(secondPart, firstPart.length);
//                 this.readIndex = samplesNeeded - firstPart.length;
//             }
//         } else if (available > 0) {
//             // 当可用样本不足时，先复制现有样本，再对缺少部分做简单淡出
//             if (this.readIndex + available <= this.bufferSize) {
//                 output.set(this.buffer.subarray(this.readIndex, this.readIndex + available));
//             } else {
//                 const firstPart = this.buffer.subarray(this.readIndex, this.bufferSize);
//                 const secondPart = this.buffer.subarray(0, available - firstPart.length);
//                 output.set(firstPart);
//                 output.set(secondPart, firstPart.length);
//             }
//             // 对剩下的样本做淡出处理，降低突变产生的噪音
//             for (let i = available; i < samplesNeeded; i++) {
//                 const fadeFactor = 1 - (i - available) / (samplesNeeded - available);
//                 // 使用前一采样作为过渡
//                 output[i] = output[i - 1] * fadeFactor;
//             }
//             this.readIndex = this.writeIndex;
//         } else {
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
