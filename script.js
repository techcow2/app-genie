let highlightMode = false;
let highlightOverlay;
let projects = [];
let currentProject = null;
let currentRevisionIndex = null;
let apiKey = '';
let originalCode = '';
let projectIndexToDelete = null;
let revisionIndexToDelete = null;
let codeMirrorEditor;

document.addEventListener('DOMContentLoaded', () => {
    checkApiKey();
    loadProjects();
    hideLoadingModal(); // Ensure the modal is hidden initially

    // Initialize CodeMirror
    codeMirrorEditor = CodeMirror.fromTextArea(document.getElementById('codeOutput'), {
        lineNumbers: true,
        mode: "javascript",
        theme: "dracula",
        autoCloseBrackets: true,
        matchBrackets: true,
    });

    codeMirrorEditor.on('change', checkSyntax);
    refreshCodeMirror(); // Refresh CodeMirror to ensure line numbers are displayed

    originalCode = codeMirrorEditor.getValue(); // Store the initial code

    var deleteButton = document.getElementById('deleteAllRevisionsButton');
    if (deleteButton) { deleteButton.addEventListener('click', deleteAllRevisions); } // Add event listener for delete all revisions button

    // Ensure the download button only has one event listener
    const downloadButton = document.getElementById('downloadButton');
    downloadButton.removeEventListener('click', downloadCode); // Remove existing listener
    downloadButton.addEventListener('click', downloadCode); // Add new listener

    // Add event listener to file input
    document.getElementById('image').addEventListener('change', handleImageUpload);

    // Add event listener to the delete confirmation button
    const confirmDeleteButton = document.getElementById('confirmDeleteButton');
    confirmDeleteButton.addEventListener('click', () => {
        if (projectIndexToDelete !== null && revisionIndexToDelete !== null) {
            deleteRevision(projectIndexToDelete, revisionIndexToDelete);
            closeConfirmationModal();
        }
    });

    resetUI(); // Call resetUI after CodeMirror is initialized

    // Adjust toolbar buttons on window resize
    window.addEventListener('resize', adjustToolbarButtons);
    adjustToolbarButtons(); // Initial call
});

function refreshCodeMirror() {
    setTimeout(() => {
        codeMirrorEditor.refresh();
    }, 100);
}

function checkApiKey() {
    apiKey = localStorage.getItem('openai_api_key');
    if (!apiKey) {
        showApiKeyModal();
    }
}

function showApiKeyModal() {
    document.getElementById('apiKeyModal').style.display = 'flex';
}

function hideApiKeyModal() {
    document.getElementById('apiKeyModal').style.display = 'none';
}

function toggleHighlightMode() {
    highlightMode = !highlightMode;
    const button = document.getElementById('highlightModeButton');
    if (highlightMode) {
        button.classList.replace('bg-purple-700', 'bg-green-700');
        button.classList.replace('border-purple-600', 'border-green-600');
        button.classList.replace('hover:bg-purple-600', 'hover:bg-green-600');
        button.classList.replace('focus:ring-purple-500', 'focus:ring-green-500');
        addHighlightOverlay();
    } else {
        button.classList.replace('bg-green-700', 'bg-purple-700');
        button.classList.replace('border-green-600', 'border-purple-600');
        button.classList.replace('hover:bg-green-600', 'hover:bg-purple-600');
        button.classList.replace('focus:ring-green-500', 'focus:ring-purple-500');
        removeHighlightOverlay();
    }
}

function addHighlightOverlay() {
    const previewFrame = document.getElementById('preview');
    highlightOverlay = document.createElement('div');
    highlightOverlay.style.position = 'absolute';
    highlightOverlay.style.top = previewFrame.offsetTop + 'px';
    highlightOverlay.style.left = previewFrame.offsetLeft + 'px';
    highlightOverlay.style.width = previewFrame.offsetWidth + 'px';
    highlightOverlay.style.height = previewFrame.offsetHeight + 'px';
    highlightOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    highlightOverlay.style.pointerEvents = 'none';
    document.body.appendChild(highlightOverlay);

    previewFrame.contentWindow.document.body.addEventListener('click', handlePreviewClick);
}

function removeHighlightOverlay() {
    if (highlightOverlay) {
        document.body.removeChild(highlightOverlay);
        highlightOverlay = null;
    }
    const previewFrame = document.getElementById('preview');
    previewFrame.contentWindow.document.body.removeEventListener('click', handlePreviewClick);
}

function handlePreviewClick(event) {
    if (!highlightMode) return;

    const clickedElement = event.target;
    const elementHTML = clickedElement.outerHTML;

    // Find the corresponding code in the CodeMirror editor
    const code = codeMirrorEditor.getValue();
    const index = code.indexOf(elementHTML);

    if (index !== -1) {
        const lineNumber = code.substr(0, index).split('\n').length - 1;
        codeMirrorEditor.scrollIntoView({line: lineNumber, ch: 0});
        codeMirrorEditor.setSelection({line: lineNumber, ch: 0}, {line: lineNumber, ch: elementHTML.length});
        codeMirrorEditor.focus();
    }
}

function updatePreview() {
    const code = codeMirrorEditor ? codeMirrorEditor.getValue() : '';
    const previewFrame = document.getElementById('preview');
    previewFrame.srcdoc = code;

    // Re-add event listener for highlight mode if it's active
    if (highlightMode) {
        previewFrame.onload = () => {
            previewFrame.contentWindow.document.body.addEventListener('click', handlePreviewClick);
        };
    }
}

function submitApiKey() {
    const input = document.getElementById('apiKeyInput').value;
    if (input) {
        apiKey = input;
        localStorage.setItem('openai_api_key', apiKey);
        hideApiKeyModal();
    } else {
        alert('Please enter a valid API key.');
    }
}

async function generateCode() {
    const projectName = document.getElementById('projectName').value.trim();
    const prompt = document.getElementById('prompt').value.trim();
    const imageInfo = document.getElementById('imageInfo').value.trim();

    if (!projectName || !prompt) {
        alert('Please enter a valid project name and prompt.');
        return;
    }

    if (!apiKey) {
        showApiKeyModal();
        return;
    }

    let fullPrompt = `Create a complete, mobile-first web app using only HTML, JavaScript, and Tailwind CSS. The web app should be self-contained, functioning entirely on the client side without relying on a backend. Provide the entire working code in a single document. Include the details about the changes you made with INFO BEGIN (one line above the written details) and INFO END one line after the details end. Only return the full working code after the INFO END line with nothing else. Prompt: ${prompt}`;

    if (imageInfo) {
        fullPrompt += ` The user has also provided an image that contains the following details: ${imageInfo}`;
    }

    showLoadingModal();

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: fullPrompt }],
                temperature: 0.7
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                let generatedCode = data.choices[0].message.content;

                // Extract INFO BEGIN/END details
                const infoStart = generatedCode.indexOf('INFO BEGIN');
                const infoEnd = generatedCode.indexOf('INFO END');
                const infoDetails = generatedCode.substring(infoStart + 10, infoEnd).trim();

                // Display the INFO details
                document.getElementById('infoContent').textContent = infoDetails;
                document.getElementById('infoContainer').classList.remove('hidden');

                // Remove INFO BEGIN/END details and the "```html" and "```" tags from the generated code
                generatedCode = generatedCode.replace(generatedCode.substring(infoStart, infoEnd + 8), '').replace(/```html/g, '').replace(/```/g, '').trim();

                if (codeMirrorEditor) {
                    codeMirrorEditor.setValue(generatedCode);
                }
                refreshCodeMirror(); // Refresh CodeMirror after setting new content
                updatePreview();  // Ensure the preview is updated after generating code
                saveProject(projectName, generatedCode, prompt);
                document.getElementById('generateButton').style.display = 'none';
                document.getElementById('updateButton').style.display = 'inline-block';
                document.getElementById('prompt').value = ''; // Clear the prompt field
                document.getElementById('promptLabel').textContent = 'Update your app:'; // Change the label text
                
                // Automatically expand Generated Code and Live Preview sections
                ensureSectionExpanded('codeOutputContainer');
                ensureSectionExpanded('iframeContainer');
            } else {
                throw new Error('No code generated. Please check your prompt and try again.');
            }
        } else {
            const errorData = await response.json();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.message}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert(`An error occurred while generating the code: ${error.message}`);
    } finally {
        hideLoadingModal();
        clearImageStatus(); // Clear image status after generation
    }
}

async function updateCode() {
    const prompt = document.getElementById('prompt').value.trim();
    const currentCode = codeMirrorEditor ? codeMirrorEditor.getValue().trim() : '';
    const imageInfo = document.getElementById('imageInfo').value.trim();

    if (!prompt) {
        alert('Please enter the updates you want to make to the code.');
        return;
    }

    if (!apiKey) {
        showApiKeyModal();
        return;
    }

    let fullPrompt = `Here is the current code of my web app:\n\n${currentCode}\n\nPlease update the web app according to the following requirements:\n\n${prompt}\n\nInclude the details about the changes you made with INFO BEGIN (one line above the written details) and INFO END one line after the details end. Only return the full working code after the INFO END line with nothing else.`;

    if (imageInfo) {
        fullPrompt += ` The user has also provided an image that contains the following details: ${imageInfo}`;
    }

    showLoadingModal();

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: fullPrompt }],
                temperature: 0.7
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                let updatedCode = data.choices[0].message.content;

                // Extract INFO BEGIN/END details
                const infoStart = updatedCode.indexOf('INFO BEGIN');
                const infoEnd = updatedCode.indexOf('INFO END');
                const infoDetails = updatedCode.substring(infoStart + 10, infoEnd).trim();

                // Display the INFO details
                document.getElementById('infoContent').textContent = infoDetails;
                document.getElementById('infoContainer').classList.remove('hidden');

                // Remove INFO BEGIN/END details and the "```html" and "```" tags from the updated code
                updatedCode = updatedCode.replace(updatedCode.substring(infoStart, infoEnd + 8), '').replace(/```html/g, '').replace(/```/g, '').trim();

                if (codeMirrorEditor) {
                    codeMirrorEditor.setValue(updatedCode);
                }
                refreshCodeMirror(); // Refresh CodeMirror after setting new content
                updatePreview();  // Ensure the preview is updated after generating code
                saveProjectRevision(updatedCode, prompt);
                document.getElementById('prompt').value = ''; // Clear the prompt field
                document.getElementById('promptLabel').textContent = 'Update your app:'; // Change the label text
            } else {
                throw new Error('No updated code generated. Please check your prompt and try again.');
            }
        } else {
            const errorData = await response.json();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.message}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert(`An error occurred while updating the code: ${error.message}`);
    } finally {
        hideLoadingModal();
        clearImageStatus(); // Clear image status after update
    }
}

function cleanGeneratedCode(code) {
    // Remove any extra text or formatting that is not part of the actual code
    code = code.replace(/```html/g, '');
    code = code.replace(/```/g, '');
    return code.trim();
}

function saveProject(name, code, prompt) {
    const project = {
        name: name,
        code: code,
        prompt: prompt,
        revisions: [{ code: code, prompt: prompt, date: new Date(), starred: false }]
    };
    projects.push(project);
    currentProject = project;
    currentRevisionIndex = 0;
    saveProjects();
    updateHistoryList();
}

function saveProjectRevision(code, prompt) {
    if (currentProject) {
        const newRevision = { code: code, prompt: prompt, date: new Date(), starred: false };
        currentProject.revisions.push(newRevision);
        currentRevisionIndex = currentProject.revisions.length - 1;
        saveProjects();
        updateHistoryList();
    } else {
        alert('No current project found. Please generate a new project first.');
    }
}

function deleteRevision(projectIndex, revisionIndex) {
    if (projects[projectIndex].revisions.length > 1) {
        projects[projectIndex].revisions.splice(revisionIndex, 1);
    } else {
        projects.splice(projectIndex, 1);
    }
    saveProjects();
    updateHistoryList();
}

function confirmDeleteRevision(projectIndex, revisionIndex) {
    projectIndexToDelete = projectIndex;
    revisionIndexToDelete = revisionIndex;
    showConfirmationModal();
}

function saveProjects() {
    localStorage.setItem('projects', JSON.stringify(projects));
}

function loadProjects() {
    const storedProjects = localStorage.getItem('projects');
    if (storedProjects) {
        projects = JSON.parse(storedProjects);
    }
    updateHistoryList();
}

function updateHistoryList() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    projects.forEach((project, projectIndex) => {
        const projectHeader = document.createElement('li');
        projectHeader.classList.add('project-header', 'cursor-pointer', 'py-2', 'px-4', 'bg-gray-800', 'rounded-md', 'mb-2', 'flex', 'justify-between', 'items-center');
        projectHeader.innerHTML = `
            <span>${project.name}</span>
            <i class="fas fa-chevron-down"></i>
        `;
        projectHeader.addEventListener('click', () => {
            const projectRevisions = document.querySelector(`.project-revisions[data-project-index="${projectIndex}"]`);
            if (projectRevisions.classList.contains('hidden')) {
                projectRevisions.classList.remove('hidden');
                projectHeader.querySelector('i').classList.replace('fa-chevron-down', 'fa-chevron-up');
            } else {
                projectRevisions.classList.add('hidden');
                projectHeader.querySelector('i').classList.replace('fa-chevron-up', 'fa-chevron-down');
            }
        });
        historyList.appendChild(projectHeader);

        const projectRevisions = document.createElement('ul');
        projectRevisions.classList.add('project-revisions', 'hidden', 'ml-4');
        projectRevisions.setAttribute('data-project-index', projectIndex);

        // Reverse the order of revisions before rendering
        const reversedRevisions = [...project.revisions].reverse();

        reversedRevisions.forEach((revision, revisionIndex) => {
            const actualRevisionIndex = project.revisions.length - 1 - revisionIndex; // Calculate actual index

            const revisionItem = document.createElement('li');
            revisionItem.classList.add('history-item', 'py-2', 'px-4', 'bg-gray-800', 'rounded-md', 'mb-2', 'flex', 'justify-between', 'items-center', 'text-white');
            if (project === currentProject && actualRevisionIndex === currentRevisionIndex) {
                revisionItem.classList.add('active-revision', 'bg-blue-800');
            }

            const revisionInfo = document.createElement('div');
            revisionInfo.classList.add('flex-grow', 'mr-4', 'truncate');
            revisionInfo.textContent = revision.prompt; // Only display the actual prompt

            const starButton = document.createElement('button');
            starButton.innerHTML = revision.starred ? '<i class="fas fa-star text-yellow-500"></i>' : '<i class="far fa-star text-yellow-500"></i>';
            starButton.classList.add('star-button', 'ml-2');
            starButton.onclick = () => toggleStar(projectIndex, actualRevisionIndex);

            const loadButton = document.createElement('button');
            loadButton.innerHTML = '<i class="fas fa-arrow-circle-right text-blue-600"></i>';
            loadButton.classList.add('load-button', 'ml-2');
            loadButton.onclick = () => loadRevision(projectIndex, actualRevisionIndex);

            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = '<i class="fas fa-trash-alt text-red-600"></i>';
            deleteButton.classList.add('delete-button', 'ml-2');
            deleteButton.onclick = () => confirmDeleteRevision(projectIndex, actualRevisionIndex);

            revisionItem.appendChild(revisionInfo);
            revisionItem.appendChild(starButton);
            revisionItem.appendChild(loadButton);
            revisionItem.appendChild(deleteButton);
            projectRevisions.appendChild(revisionItem);
        });

        historyList.appendChild(projectRevisions);
    });
}

function toggleStar(projectIndex, revisionIndex) {
    projects[projectIndex].revisions[revisionIndex].starred = !projects[projectIndex].revisions[revisionIndex].starred;
    saveProjects();
    updateHistoryList();
}

function loadRevision(projectIndex, revisionIndex) {
    currentProject = projects[projectIndex];
    currentRevisionIndex = revisionIndex;
    if (codeMirrorEditor) {
        codeMirrorEditor.setValue(currentProject.revisions[revisionIndex].code);
    }
    refreshCodeMirror(); // Refresh CodeMirror after setting new content
    updateHistoryList();
    updatePreview();
    document.getElementById('generateButton').style.display = 'none';
    document.getElementById('updateButton').style.display = 'inline-block';
    document.getElementById('prompt').value = ''; // Clear the prompt field
    document.getElementById('promptLabel').textContent = 'Update your app:'; // Change the label text

    // Ensure "Generated Code" section is expanded
    ensureSectionExpanded('codeOutputContainer');

    // Ensure "Live Preview" section is expanded
    ensureSectionExpanded('iframeContainer');
}

function ensureSectionExpanded(sectionId) {
    const section = document.getElementById(sectionId);
    if (section.classList.contains('hidden')) {
        toggleCollapsible(sectionId);
    }
}

function resetUI() {
    document.getElementById('projectName').value = '';
    document.getElementById('prompt').value = '';
    if (codeMirrorEditor) {
        codeMirrorEditor.setValue('');
    }
    document.getElementById('image').value = '';
    document.getElementById('imageInfo').value = '';
    document.getElementById('uploadStatus').textContent = '';
}

function showLoadingModal() {
    document.getElementById('loadingModal').style.display = 'flex';
}

function hideLoadingModal() {
    document.getElementById('loadingModal').style.display = 'none';
}

function previewInNewTab() {
    const code = codeMirrorEditor ? codeMirrorEditor.getValue() : '';
    const newWindow = window.open('', '_blank', 'width=1024,height=768'); // Adjust the size as needed
    newWindow.document.write(code);
    newWindow.document.close();
}

function resetTool() {
    if (confirm('Are you sure you want to reset? This will clear all current data and remove the API key.')) {
        projects = [];
        currentProject = null;
        currentRevisionIndex = null;
        apiKey = '';
        localStorage.removeItem('openai_api_key'); // Remove stored API key
        saveProjects();
        resetUI();
        updateHistoryList();
        clearPreview(); // Clear the preview window
        showApiKeyModal(); // Show the API key modal after reset
    }
}

function clearPreview() {
    const previewFrame = document.getElementById('preview');
    previewFrame.srcdoc = '';
}

function saveCodeModification() {
    const code = codeMirrorEditor ? codeMirrorEditor.getValue() : '';
    if (currentRevisionIndex !== null && currentProject) {
        currentProject.revisions[currentRevisionIndex].code = code;
        currentProject.revisions[currentRevisionIndex].date = new Date();
        saveProjects();
        updateHistoryList();
        alert('Code modifications saved successfully.');
    } else {
        alert('No project or revision selected to save.');
    }
}

function discardCodeModification() {
    if (currentRevisionIndex !== null && currentProject) {
        if (codeMirrorEditor) {
            codeMirrorEditor.setValue(originalCode);
        }
        updatePreview();
        alert('Code modifications discarded.');
    } else {
        alert('No project or revision selected to discard.');
    }
}

function updatePreview() {
    const code = codeMirrorEditor ? codeMirrorEditor.getValue() : '';
    const previewFrame = document.getElementById('preview');
    previewFrame.srcdoc = code;
}

function startNewProject() {
    resetUI();
    clearPreview(); // Clear the live preview window
    document.getElementById('generateButton').style.display = 'inline-block';
    document.getElementById('updateButton').style.display = 'none';
    currentProject = null;
    currentRevisionIndex = null;
    originalCode = '';
    document.getElementById('promptLabel').textContent = 'Describe your app:'; // Change the label text back
    
    // Clear the yellow information window
    const infoContainer = document.getElementById('infoContainer');
    infoContainer.classList.add('hidden');
    document.getElementById('infoContent').textContent = '';
}

function toggleCollapsible(id) {
    const element = document.getElementById(id);
    const collapsibleBtn = document.querySelector(`.collapsible-btn[onclick="toggleCollapsible('${id}')"]`);
    if (element.classList.contains('hidden')) {
        element.classList.remove('hidden');
        if (id === 'codeOutputContainer') {
            collapsibleBtn.querySelector('span').textContent = 'Hide Code';
        } else if (id === 'iframeContainer') {
            collapsibleBtn.querySelector('span').textContent = 'Hide Preview';
        }
        collapsibleBtn.querySelector('i').classList.replace('fa-chevron-down', 'fa-chevron-up');
    } else {
        element.classList.add('hidden');
        if (id === 'codeOutputContainer') {
            collapsibleBtn.querySelector('span').textContent = 'Expand Code';
        } else if (id === 'iframeContainer') {
            collapsibleBtn.querySelector('span').textContent = 'Expand Preview';
        }
        collapsibleBtn.querySelector('i').classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
}

function setMobileView() {
    const previewFrame = document.getElementById('preview');
    previewFrame.style.width = '375px';
    previewFrame.style.height = '667px';
}

function setDesktopView() {
    const previewFrame = document.getElementById('preview');
    previewFrame.style.width = '1024px';
    previewFrame.style.height = '768px';
}

function downloadCode() {
    const code = codeMirrorEditor ? codeMirrorEditor.getValue().trim() : '';
    if (!code) {
        alert('No code to download. Please generate or update the code first.');
        return;
    }

    const projectName = document.getElementById('projectName').value.trim() || 'generated-app';
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function toggleHelpDropdown() {
    const dropdown = document.getElementById('helpDropdown');
    dropdown.classList.toggle('hidden');
}

function clearPrompt() {
    document.getElementById('projectName').value = '';
    document.getElementById('prompt').value = '';
}

function clearImageStatus() {
    document.getElementById('image').value = '';
    document.getElementById('imageInfo').value = '';
    document.getElementById('uploadStatus').textContent = '';
}

async function handleImageUpload() {
    const fileInput = document.getElementById('image');
    const uploadStatus = document.getElementById('uploadStatus');

    if (!fileInput.files.length) {
        alert('Please select an image to upload.');
        return;
    }

    const file = fileInput.files[0];
    uploadStatus.textContent = `File attached: ${file.name}`;

    if (!apiKey) {
        showApiKeyModal();
        return;
    }

    const reader = new FileReader();
    reader.onloadend = async function() {
        const base64Image = reader.result.split(',')[1]; // Get the base64 string without the prefix

        const payload = {
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'What’s in this image?'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 300
        };

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                const imageAnalysis = data.choices[0].message.content;
                document.getElementById('imageInfo').value = imageAnalysis;
            } else {
                const errorData = await response.json();
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.message}`);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    };

    reader.readAsDataURL(file);
}

function showConfirmationModal() {
    document.getElementById('confirmationModal').style.display = 'flex';
}

function closeConfirmationModal() {
    document.getElementById('confirmationModal').style.display = 'none';
}

function checkSyntax() {
    const code = codeMirrorEditor ? codeMirrorEditor.getValue() : '';
    const syntaxError = document.getElementById('syntaxError');
    const errorLineElement = document.getElementById('errorLine');

    try {
        new Function(code);
        syntaxError.classList.add('hidden');
        errorLineElement.textContent = '';
    } catch (e) {
        const match = e.stack.match(/<anonymous>:(\d+):\d+/);
        if (match) {
            const lineNumber = match[1];
            syntaxError.classList.remove('hidden');
            errorLineElement.textContent = lineNumber;
        } else {
            syntaxError.classList.add('hidden');
            errorLineElement.textContent = '';
        }
    }
}

function adjustToolbarButtons() {
    const toolbar = document.querySelector('.toolbar');
    if (window.innerWidth <= 768) {
        toolbar.style.flexDirection = 'column';
        toolbar.style.alignItems = 'center';
    } else {
        toolbar.style.flexDirection = 'row';
        toolbar.style.alignItems = 'initial';
    }
}

function copyToClipboard() {
    const code = codeMirrorEditor.getValue();
    navigator.clipboard.writeText(code).then(() => {
        alert('Copied to clipboard successfully.');
    }).catch(err => {
        alert('Failed to copy to clipboard.');
        console.error('Error:', err);
    });
}
