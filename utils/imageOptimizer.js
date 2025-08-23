/**
 * Optimizes an image by resizing and compressing it.
 * @param {string} dataUrl The base64 data URL of the image.
 * @param {number} [maxWidth=1024] The maximum width of the output image.
 * @param {number} [quality=0.85] The JPEG quality (0 to 1).
 * @returns {Promise<string>} A promise that resolves with the optimized image as a base64 data URL.
 */
export function optimizeImage(dataUrl, maxWidth = 1024, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = maxWidth / img.width;
            const newWidth = img.width > maxWidth ? maxWidth : img.width;
            const newHeight = img.height * (img.width > maxWidth ? scale : 1);

            canvas.width = newWidth;
            canvas.height = newHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            const optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(optimizedDataUrl);
        };
        img.onerror = (err) => {
            reject(new Error(`Failed to load image for optimization.`));
        };
        img.src = dataUrl;
    });
}
