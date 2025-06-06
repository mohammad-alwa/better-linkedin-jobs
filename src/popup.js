document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveKey');
    const statusDiv = document.getElementById('status');
    const noKeyState = document.getElementById('noKeyState');
    const existingKeyState = document.getElementById('existingKeyState');
    const maskedKeySpan = document.getElementById('maskedKey');
    const changeKeyButton = document.getElementById('changeKey');
    const removeKeyButton = document.getElementById('removeKey');
    const autoAnalysisCheckbox = document.getElementById('autoAnalysisCheckbox');

    // Add ripple effect to buttons
    const createRipple = (event) => {
        const button = event.currentTarget;
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();

        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        ripple.classList.add('ripple');

        const existingRipple = button.querySelector('.ripple');
        if (existingRipple) {
            existingRipple.remove();
        }

        button.appendChild(ripple);

        // Remove ripple after animation completes
        setTimeout(() => {
            ripple.remove();
        }, 600);
    };

    // Add ripple effect to all buttons
    const addRippleToButtons = () => {
        const buttons = document.querySelectorAll('.btn');
        buttons.forEach(button => {
            button.addEventListener('click', createRipple);
        });
    };

    // Initialize ripple effect
    addRippleToButtons();

    // Show status message
    const showStatus = (message, type) => {
        statusDiv.innerHTML = '';

        const icon = document.createElement('span');
        icon.className = 'status-icon material-icons';
        icon.textContent = type === 'success' ? 'check_circle' : 'error';

        const text = document.createElement('span');
        text.textContent = message;

        statusDiv.appendChild(icon);
        statusDiv.appendChild(text);

        statusDiv.className = `status status-${type} visible`;

        // Hide status after 5 seconds
        setTimeout(() => {
            statusDiv.classList.remove('visible');
        }, 5000);
    };

    // Mask API key (show first 4 and last 4 characters)
    const maskApiKey = (apiKey) => {
        if (!apiKey || apiKey.length < 8) return apiKey;

        const firstFour = apiKey.substring(0, 4);
        const lastFour = apiKey.substring(apiKey.length - 4);

        return `${firstFour}****${lastFour}`;
    };

    // Validate API key by making a request to the Gemini API
    const validateApiKey = async (apiKey) => {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

            if (response.ok) {
                return { valid: true };
            } else {
                const errorData = await response.json();
                return {
                    valid: false,
                    error: errorData.error?.message || 'Invalid API key'
                };
            }
        } catch (error) {
            return {
                valid: false,
                error: 'Network error. Please check your connection.'
            };
        }
    };

    // Show the appropriate UI state based on whether an API key exists
    const showUiState = (hasKey, apiKey = '') => {
        if (hasKey) {
            noKeyState.style.display = 'none';
            existingKeyState.style.display = 'block';
            maskedKeySpan.textContent = maskApiKey(apiKey);
        } else {
            noKeyState.style.display = 'block';
            existingKeyState.style.display = 'none';
            apiKeyInput.value = '';
            apiKeyInput.classList.remove('has-value');
        }
    };

    // Handle input focus events for floating label effect
    apiKeyInput.addEventListener('focus', (event) => {
        event.target.parentElement.classList.add('focused');
    });

    apiKeyInput.addEventListener('blur', (event) => {
        event.target.parentElement.classList.remove('focused');
        if (event.target.value.trim() !== '') {
            event.target.classList.add('has-value');
        } else {
            event.target.classList.remove('has-value');
        }
    });

    // Handle save button click
    saveButton.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showStatus('Please enter your API key.', 'error');
            return;
        }

        // Show loading state
        const loadingSpinner = document.createElement('span');
        loadingSpinner.className = 'loading';
        saveButton.appendChild(loadingSpinner);
        saveButton.disabled = true;

        // Validate the API key
        const validation = await validateApiKey(apiKey);

        if (!validation.valid) {
            loadingSpinner.remove();
            saveButton.disabled = false;
            showStatus(validation.error, 'error');
            return;
        }

        // Save the API key to Chrome extension storage
        chrome.storage.local.set({ geminiApiKey: apiKey }, function () {
            // Remove loading spinner
            loadingSpinner.remove();
            saveButton.disabled = false;

            if (chrome.runtime.lastError) {
                showStatus('Error saving API key: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showStatus('API key saved successfully!', 'success');
                showUiState(true, apiKey);
            }
        });
    });

    // Handle change key button click
    changeKeyButton.addEventListener('click', () => {
        showUiState(false);
    });

    // Handle remove key button click
    removeKeyButton.addEventListener('click', async () => {
        // Show loading state
        const loadingSpinner = document.createElement('span');
        loadingSpinner.className = 'loading';
        removeKeyButton.appendChild(loadingSpinner);
        removeKeyButton.disabled = true;
        changeKeyButton.disabled = true;

        // Remove the API key from Chrome extension storage
        chrome.storage.local.remove('geminiApiKey', function () {
            // Remove loading spinner
            loadingSpinner.remove();
            removeKeyButton.disabled = false;
            changeKeyButton.disabled = false;

            if (chrome.runtime.lastError) {
                showStatus('Error removing API key: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showStatus('API key removed successfully!', 'success');
                showUiState(false);
            }
        });
    });

    // Handle auto analysis checkbox change
    autoAnalysisCheckbox.addEventListener('change', async (event) => {
        const isChecked = event.target.checked;

        // Save the auto analysis setting to storage
        chrome.storage.local.set({ autoAnalysisEnabled: isChecked }, function () {
            if (chrome.runtime.lastError) {
                showStatus('Error saving setting: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showStatus(
                    isChecked ? 'Auto Analysis enabled' : 'Auto Analysis disabled',
                    'success'
                );
            }
        });
    });

    // Check if API key already exists in extension storage and load auto analysis setting
    chrome.storage.local.get(['geminiApiKey', 'autoAnalysisEnabled'], function (result) {
        if (result.geminiApiKey) {
            showUiState(true, result.geminiApiKey);

            // Set checkbox state based on stored setting
            if (result.autoAnalysisEnabled !== undefined) {
                autoAnalysisCheckbox.checked = result.autoAnalysisEnabled;
            }
        } else {
            showUiState(false);
        }
    });
});
