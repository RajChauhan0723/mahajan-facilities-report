// Image processing and compression for Mahajan Facilities Daily Cleaning Report

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_DIMENSION = 1200; // Optimal balance for crystal-clear A4 inspection and low PDF file size
const JPEG_QUALITY = 0.82;

/**
 * Validates if the uploaded file is an allowed image format
 */
export function isAllowedImage(file) {
  if (!file) return false;
  if (ALLOWED_TYPES.includes(file.type.toLowerCase())) return true;
  // Fallback for file extension if MIME type is missing or generic
  const ext = file.name.split('.').pop().toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
}

/**
 * Reads and optimizes an image file into a standardized JPEG data URL.
 * Automatically respects EXIF orientation, downsizes high-resolution mobile photos,
 * and extracts natural dimensions and aspect ratio.
 */
export function processImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!isAllowedImage(file)) {
      reject(new Error(`Unsupported file format "${file.name}". Please upload JPG, JPEG, PNG, or WEBP images only.`));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error(`Failed to read file "${file.name}".`));
    };

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => {
        reject(new Error(`Could not decode image "${file.name}". The file may be corrupt.`));
      };

      img.onload = () => {
        try {
          let { width, height } = img;

          // Downscale if dimensions exceed MAX_DIMENSION while strictly preserving aspect ratio
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.round((height * MAX_DIMENSION) / width);
              width = MAX_DIMENSION;
            } else {
              width = Math.round((width * MAX_DIMENSION) / height);
              height = MAX_DIMENSION;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          // Fill background with white in case of transparent PNG/WEBP
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          // Draw image onto canvas
          ctx.drawImage(img, 0, 0, width, height);

          // Export as compressed JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);

          const photoRecord = {
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
            name: file.name,
            originalSize: file.size,
            dataUrl: dataUrl,
            width: width,
            height: height,
            aspectRatio: width / height,
            createdAt: Date.now()
          };

          resolve(photoRecord);
        } catch (err) {
          reject(new Error(`Image compression failed for "${file.name}": ${err.message}`));
        }
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Helper to format file sizes nicely
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
