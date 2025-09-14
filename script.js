let uploadedFiles = [];

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileListSection = document.getElementById('fileListSection');
const fileList = document.getElementById('fileList');
const convertBtn = document.getElementById('convertBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const downloadSection = document.getElementById('downloadSection');
const downloadBtn = document.getElementById('downloadBtn');
const compressionType = document.getElementById('compressionType');
const customCompression = document.getElementById('customCompression');
const targetSize = document.getElementById('targetSize');
const sizeUnit = document.getElementById('sizeUnit');
const compressionRatio = document.getElementById('compressionRatio');
const ratioValue = document.getElementById('ratioValue');
const sizePreview = document.getElementById('sizePreview');
const originalSize = document.getElementById('originalSize');
const estimatedSize = document.getElementById('estimatedSize');

// Supported file types with icons
const fileTypeIcons = {
    'image': '🖼️',
    'pdf': '📄',
    'document': '📝',
    'spreadsheet': '📊',
    'text': '📃',
    'file': '📁'
};

// Initialize drag and drop functionality
function initializeDragAndDrop() {
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            handleFiles(files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            handleFiles(files);
        }
    });
}

// Handle file uploads
async function handleFiles(files) {
    if (files.length > 20) {
        alert('최대 20개의 파일만 업로드할 수 있습니다.');
        return;
    }

    const formData = new FormData();
    let hasOversizeFile = false;

    files.forEach(file => {
        if (file.size > 50 * 1024 * 1024) {
            alert(`${file.name}은 50MB를 초과합니다.`);
            hasOversizeFile = true;
            return;
        }
        formData.append('files', file);
    });

    if (hasOversizeFile) return;

    try {
        showProgress('파일 업로드 중...', 30);

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            uploadedFiles = [...uploadedFiles, ...result.files];
            displayFiles();
            updateSizePreview();
            fileListSection.style.display = 'block';
            hideProgress();
        } else {
            alert('업로드 실패: ' + result.error);
            hideProgress();
        }
    } catch (error) {
        alert('업로드 중 오류가 발생했습니다: ' + error.message);
        hideProgress();
    }
}

// Display uploaded files
function displayFiles() {
    fileList.innerHTML = '';

    uploadedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        // Create file icon/preview
        const filePreview = document.createElement('div');
        filePreview.className = 'file-preview';

        if (file.type === 'image') {
            const imgPreview = document.createElement('img');
            imgPreview.src = `/uploads/${file.filename}`;
            imgPreview.alt = file.originalname;
            imgPreview.className = 'image-preview';

            imgPreview.onerror = function() {
                this.style.display = 'none';
                const placeholder = document.createElement('div');
                placeholder.className = 'file-icon';
                placeholder.textContent = fileTypeIcons[file.type] || fileTypeIcons.file;
                filePreview.appendChild(placeholder);
            };

            filePreview.appendChild(imgPreview);
        } else {
            const fileIcon = document.createElement('div');
            fileIcon.className = 'file-icon';
            fileIcon.textContent = fileTypeIcons[file.type] || fileTypeIcons.file;
            filePreview.appendChild(fileIcon);
        }

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';

        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = file.originalname;

        const fileDetails = document.createElement('div');
        fileDetails.className = 'file-details';

        const fileSize = document.createElement('span');
        fileSize.className = 'file-size';
        fileSize.textContent = formatFileSize(file.size);

        const fileTypeLabel = document.createElement('span');
        fileTypeLabel.className = 'file-type';
        fileTypeLabel.textContent = getFileTypeLabel(file.type);

        fileDetails.appendChild(fileSize);
        fileDetails.appendChild(document.createTextNode(' • '));
        fileDetails.appendChild(fileTypeLabel);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.title = '파일 제거';
        removeBtn.onclick = () => removeFile(index);

        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileDetails);

        fileItem.appendChild(filePreview);
        fileItem.appendChild(fileInfo);
        fileItem.appendChild(removeBtn);

        fileList.appendChild(fileItem);
    });

    // Update convert button state
    convertBtn.disabled = uploadedFiles.length === 0;
}

// Get file type label for display
function getFileTypeLabel(type) {
    const labels = {
        'image': '이미지',
        'pdf': 'PDF',
        'document': '문서',
        'spreadsheet': '스프레드시트',
        'text': '텍스트',
        'file': '파일'
    };
    return labels[type] || '파일';
}

// Remove file from list
async function removeFile(index) {
    const file = uploadedFiles[index];

    try {
        // Delete file from server
        await fetch(`/delete/${file.filename}`, {
            method: 'DELETE'
        });

        // Remove from local array
        uploadedFiles.splice(index, 1);

        // Update display
        displayFiles();
        updateSizePreview();

        // Hide file list section if no files
        if (uploadedFiles.length === 0) {
            fileListSection.style.display = 'none';
            sizePreview.style.display = 'none';
        }
    } catch (error) {
        console.error('Error removing file:', error);
        // Still remove from display even if server deletion fails
        uploadedFiles.splice(index, 1);
        displayFiles();
        updateSizePreview();
    }
}

// Toggle custom compression options
function toggleCustomCompression() {
    const isCustom = compressionType.value === 'custom';
    customCompression.style.display = isCustom ? 'block' : 'none';
    updateSizePreview();
}

// Update compression ratio value display
function updateRatioValue() {
    ratioValue.textContent = compressionRatio.value + '%';
    updateSizePreview();
}

// Update size preview
function updateSizePreview() {
    if (uploadedFiles.length === 0) {
        sizePreview.style.display = 'none';
        return;
    }

    const totalSize = uploadedFiles.reduce((sum, file) => sum + file.size, 0);
    originalSize.textContent = formatFileSize(totalSize);

    let estimatedCompressedSize = totalSize;

    switch (compressionType.value) {
        case 'low':
            estimatedCompressedSize = totalSize * 0.9;
            break;
        case 'medium':
            estimatedCompressedSize = totalSize * 0.7;
            break;
        case 'high':
            estimatedCompressedSize = totalSize * 0.5;
            break;
        case 'custom':
            if (targetSize.value) {
                const targetBytes = targetSize.value * (sizeUnit.value === 'MB' ? 1024 * 1024 : 1024);
                estimatedCompressedSize = Math.min(targetBytes, totalSize);
            } else {
                estimatedCompressedSize = totalSize * (compressionRatio.value / 100);
            }
            break;
    }

    estimatedSize.textContent = formatFileSize(estimatedCompressedSize);
    sizePreview.style.display = 'block';
}

// Convert files to PDF
async function convertToPDF() {
    if (uploadedFiles.length === 0) {
        alert('변환할 파일이 없습니다.');
        return;
    }

    const compression = compressionType.value;
    let requestData = {
        files: uploadedFiles,
        compression: compression
    };

    // Add custom compression parameters
    if (compression === 'custom') {
        if (targetSize.value) {
            const targetSizeKB = targetSize.value * (sizeUnit.value === 'MB' ? 1024 : 1);
            requestData.targetSizeKB = targetSizeKB;
        }
        requestData.compressionRatio = compressionRatio.value / 100;
    }

    try {
        showProgress('PDF로 변환 중...', 50);

        const response = await fetch('/convert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (result.success) {
            showProgress('변환 완료!', 100);
            setTimeout(() => {
                hideProgress();
                showDownload(result);
            }, 1000);
        } else {
            alert('변환 실패: ' + result.error);
            hideProgress();
        }
    } catch (error) {
        alert('변환 중 오류가 발생했습니다: ' + error.message);
        hideProgress();
    }
}

// Show progress
function showProgress(text, percentage) {
    progressSection.style.display = 'block';
    progressText.textContent = text;
    progressFill.style.width = percentage + '%';
}

// Hide progress
function hideProgress() {
    progressSection.style.display = 'none';
}

// Show download section with compression results
function showDownload(result) {
    downloadSection.style.display = 'block';

    // Update compression results
    if (result.originalSizeKB && result.compressedSizeKB) {
        document.getElementById('finalOriginalSize').textContent = formatFileSize(result.originalSizeKB * 1024);
        document.getElementById('finalCompressedSize').textContent = formatFileSize(result.compressedSizeKB * 1024);

        const savings = result.compressionRatio || 0;
        document.getElementById('finalSavings').textContent = `${savings}%`;

        document.getElementById('compressionResult').style.display = 'block';
    }

    downloadBtn.onclick = () => {
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
}

// Reset application
function resetApp() {
    uploadedFiles = [];
    fileListSection.style.display = 'none';
    progressSection.style.display = 'none';
    downloadSection.style.display = 'none';
    sizePreview.style.display = 'none';
    fileInput.value = '';
    compressionType.value = 'medium';
    toggleCustomCompression();
    targetSize.value = '';
    compressionRatio.value = 70;
    updateRatioValue();
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeDragAndDrop();

    // Add event listeners for size preview updates
    targetSize.addEventListener('input', updateSizePreview);
    sizeUnit.addEventListener('change', updateSizePreview);
    compressionRatio.addEventListener('input', updateSizePreview);
});