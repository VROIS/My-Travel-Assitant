/**
 * Optimizes an image by resizing and compressing it.
 * @param dataUrl The base64 data URL of the image.
 * @param maxWidth The maximum width of the output image. Defaults to 1024px.
 * @param quality The JPEG quality (0 to 1). Defaults to 0.85.
 * @returns A promise that resolves with the optimized image as a base64 data URL.
 */
export function optimizeImage(dataUrl: string, maxWidth: number = 1024, quality: number = 0.85): Promise<string> {
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
