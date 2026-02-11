class AudioStreamPlayer extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 48000 * 60 * 4; // Max 4 minutes, adjust buffer size as needed,
        this.audioBuffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        this.readIndex = 0;
        this.finished = false;

        this.port.onmessage = event => {
            console.log('AudioStreamPlayer received message:', event.data);
            if (event.data.type === 'add') {
                const newData = event.data.audioData; // Receive new audio data
                this.writeToBuffer(newData);
            } else if (event.data.type === 'finish') {
                // Receive finish signal
                this.finished = true;
            } else if (event.data.type === 'stop') {
                // Receive stop signal to clear buffer
                console.log('Stopping playback and clearing buffer.');
                this.stopPlayback();
            } else if (event.data.type === 'skip') {
                this.skipPlayback();
            }
        };
    }

    writeToBuffer(newData) {
        const newBufferSize = this.bufferIndex + newData.length;
        if (newBufferSize > this.bufferSize) {
            // Handle buffer overflow (e.g., by discarding old data or resizing the buffer)
            const excess = newBufferSize - this.bufferSize;
            console.warn('Buffer overflow! Discarding old data.');

            this.audioBuffer.copyWithin(0, excess, this.bufferSize);
            this.bufferIndex = this.bufferSize - excess;
        }

        this.audioBuffer.set(newData, this.bufferIndex);
        this.bufferIndex += newData.length;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channel = output[0]; // Mono output

        const samplesNeeded = channel.length;
        //console.log(`samplesNeeded: ${samplesNeeded}`);
        const availableSamples = this.bufferIndex - this.readIndex;

        if (availableSamples >= samplesNeeded) {
            // Copy data from the buffer to the output in one go
            channel.set(this.audioBuffer.subarray(this.readIndex, this.readIndex + samplesNeeded));
            this.readIndex += samplesNeeded;
            // console.log('play chunk', this.readIndex, this.bufferIndex);
        } else {
            // Not enough data in the buffer, fill with silence
            channel.fill(0);
            console.log('play none');
        }

        // When all data has been read
        if (this.readIndex >= this.bufferIndex) {
            if (this.finished) {
                console.log('audio stream finished');
                this.port.postMessage({ type: 'finished' }); // Send message to main thread
                return false; // Stop the processor
            }
            this.bufferIndex = 0;
            this.readIndex = 0;
            // console.log('buffer read complete');
        }

        return true; // Keep the processor running
    }

    stopPlayback() {
        this.bufferIndex = 0;
        this.readIndex = 0;
        this.audioBuffer.fill(0); // Clear the buffer
        console.log('Playback stopped and buffer cleared.');
        this.finished = true; // Ensure that the processor stops
        this.port.postMessage({ type: 'finished' }); // Send message to main thread
    }

    skipPlayback() {
        this.bufferIndex = 0;
        this.readIndex = 0;
        this.audioBuffer.fill(0); // Clear the buffer
        console.log('Playback stopped and buffer cleared.');
        this.finished = true; // Ensure that the processor stops
        // this.port.postMessage({ type: 'finished' }); // Send message to main thread
    }
}

registerProcessor('audio-stream-player', AudioStreamPlayer);
