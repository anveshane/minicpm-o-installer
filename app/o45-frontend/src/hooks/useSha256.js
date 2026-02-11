export const sha256 = message => {
    // Use the SubtleCrypto interface to perform SHA-256 hashing
    return window.crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(message))
        .then(hashBuffer => {
            // Convert the ArrayBuffer to a hex string
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        })
        .catch(err => {
            console.error('Error creating SHA-256 hash:', err);
        });
};

// // Example usage:
// sha256('Hello, world!').then(hash => {
//     console.log('SHA-256 Hash:', hash);
// });
