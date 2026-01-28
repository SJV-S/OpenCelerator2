/**
 * toaster.js
 * Generalized toast notification utility for displaying temporary messages and confirmations
 *
 * Standard colors:
 * - Background: white
 * - Border: #6ad1e3 (default, can be customized)
 * - Text: #374151
 * - Primary button: #6ad1e3 (default, can be customized)
 * - Secondary button: #f3f4f6
 */

// Track active toasts per position for stacking
const activeToasts = {
    'top-right': [],
    'top-right-secondary': [],
    'top-left': [],
    'bottom-right': [],
    'bottom-left': []
};

// Counter for unique toast IDs
let toastCounter = 0;

/**
 * Creates and shows a toast notification
 * @param {Object} options - Configuration options
 * @param {string} options.message - Main message text to display
 * @param {Array<Object>} options.buttons - Array of button configurations
 * @param {string} options.buttons[].label - Button text
 * @param {Function} options.buttons[].onClick - Button click handler
 * @param {string} [options.buttons[].type='secondary'] - Button type: 'primary' or 'secondary'
 * @param {string} [options.buttons[].backgroundColor] - Custom background color (overrides type)
 * @param {string} [options.buttons[].hoverColor] - Custom hover color
 * @param {string} [options.borderColor='#6ad1e3'] - Border color
 * @param {string} [options.layout='vertical'] - Layout direction: 'horizontal' or 'vertical'
 * @param {string} [options.messageId] - Optional ID for message element (for updates)
 * @param {number} [options.duration] - Optional duration in milliseconds before auto-dismiss (no auto-dismiss if not specified)
 * @param {Object} [options.stateRef] - Optional state object to store toast reference
 * @param {string} [options.stateRef.key='toastElement'] - Key name in state object for storing reference
 * @param {string} [options.position='top-right'] - Position: 'top-right', 'top-left', 'bottom-right', 'bottom-left'
 * @returns {HTMLElement} The created toast element
 */
function createToast(options) {
    const {
        message,
        buttons = [],
        borderColor = '#6ad1e3',
        layout = 'vertical',
        messageId = null,
        duration = null,
        stateRef = null,
        position = 'top-right'
    } = options;

    // Generate unique ID for this toast
    const id = `toast-${position}-${++toastCounter}`;

    // Normalize position for tracking (top-right-secondary uses top-right array)
    const trackingPosition = position === 'top-right-secondary' ? 'top-right' : position;

    // Create toast container
    const toast = document.createElement('div');
    toast.id = id;
    toast.setAttribute('data-toast', 'true');

    // Determine position styles based on position parameter
    let positionStyles = '';
    switch (position) {
        case 'top-left':
            positionStyles = 'top: 1vh; left: 1vw;';
            break;
        case 'top-right':
            positionStyles = 'top: 1vh; right: 1vw;';
            break;
        case 'top-right-secondary':
            positionStyles = 'top: 7vh; right: 1vw;';
            break;
        case 'bottom-left':
            positionStyles = 'bottom: 1vh; left: 1vw;';
            break;
        case 'bottom-right':
            positionStyles = 'bottom: 1vh; right: 1vw;';
            break;
        default:
            positionStyles = 'top: 1vh; right: 1vw;';
    }

    // Determine if this is a right-side toast for slide-in animation
    const isRightSide = position === 'top-right' || position === 'bottom-right' || position === 'top-right-secondary';

    // Base styles (common to all toasts)
    const baseStyles = `
        position: fixed;
        ${positionStyles}
        background-color: white;
        border: 2px solid ${borderColor};
        border-radius: 8px;
        padding: 12px 16px;
        display: flex;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        font-family: Arial, sans-serif;
        ${isRightSide ? 'transform: translateX(calc(100% + 1vw)); transition: transform 0.3s ease-out;' : ''}
    `;

    // Layout-specific styles
    const layoutStyles = layout === 'horizontal'
        ? 'align-items: center; gap: 12px;'
        : 'flex-direction: column; gap: 12px; min-width: 200px;';

    toast.style.cssText = baseStyles + layoutStyles;

    // Create message element
    const messageElement = document.createElement(layout === 'horizontal' ? 'span' : 'div');
    if (messageId) {
        messageElement.id = messageId;
    }
    messageElement.textContent = message;
    messageElement.style.cssText = `
        color: #374151;
        font-size: 14px;
        font-weight: 500;
    `;

    toast.appendChild(messageElement);

    // Create buttons
    if (buttons.length > 0) {
        const buttonContainer = layout === 'horizontal'
            ? toast // For horizontal, append directly to toast
            : document.createElement('div'); // For vertical, create container

        if (layout === 'vertical') {
            buttonContainer.style.cssText = `
                display: flex;
                gap: 10px;
            `;
        }

        buttons.forEach(buttonConfig => {
            // Wrap the onClick handler to auto-remove toast after clicking
            const wrappedConfig = {
                ...buttonConfig,
                onClick: () => {
                    if (buttonConfig.onClick) buttonConfig.onClick();
                    removeToast(id);
                }
            };
            const button = createButton(wrappedConfig, borderColor);
            buttonContainer.appendChild(button);
        });

        if (layout === 'vertical') {
            toast.appendChild(buttonContainer);
        }
    }

    // Append toast to body
    document.body.appendChild(toast);

    // Trigger slide-in animation for right-side toasts
    if (isRightSide) {
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });
    }

    // Store reference if state object provided
    if (stateRef && stateRef.state) {
        const key = stateRef.key || 'toastElement';
        stateRef.state[key] = toast;
    }

    // Auto-dismiss after duration if specified
    if (duration && duration > 0) {
        setTimeout(() => {
            removeToast(id);
        }, duration);
    }

    return toast;
}

/**
 * Creates a button element with specified configuration
 * @param {Object} config - Button configuration
 * @param {string} defaultPrimaryColor - Default color for primary buttons
 * @returns {HTMLElement} The created button element
 * @private
 */
function createButton(config, defaultPrimaryColor) {
    const {
        label,
        onClick,
        type = 'secondary',
        backgroundColor,
        hoverColor,
        id
    } = config;

    const button = document.createElement('button');
    if (id) {
        button.id = id;
    }
    button.textContent = label;

    // Determine colors based on type
    let bgColor, bgHoverColor, textColor, borderStyle;

    if (backgroundColor) {
        // Custom colors provided
        bgColor = backgroundColor;
        bgHoverColor = hoverColor || darkenColor(backgroundColor, 10);
        textColor = 'white';
        borderStyle = 'none';
    } else if (type === 'primary') {
        // Primary button (accent color)
        bgColor = defaultPrimaryColor;
        bgHoverColor = darkenColor(defaultPrimaryColor, 10);
        textColor = 'white';
        borderStyle = 'none';
    } else {
        // Secondary button (gray)
        bgColor = '#f3f4f6';
        bgHoverColor = '#e5e7eb';
        textColor = '#374151';
        borderStyle = '1px solid #d1d5db';
    }

    button.style.cssText = `
        flex: 1;
        background-color: ${bgColor};
        color: ${textColor};
        border: ${borderStyle};
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
    `;

    // Add hover effects
    button.onmouseover = () => {
        button.style.backgroundColor = bgHoverColor;
    };
    button.onmouseout = () => {
        button.style.backgroundColor = bgColor;
    };

    // Add click handler
    button.onclick = onClick;

    return button;
}

/**
 * Darkens a hex color by a percentage
 * @param {string} color - Hex color (e.g., '#6ad1e3')
 * @param {number} percent - Percentage to darken (0-100)
 * @returns {string} Darkened hex color
 * @private
 */
function darkenColor(color, percent) {
    // Remove # if present
    const hex = color.replace('#', '');

    // Convert to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Darken
    const factor = (100 - percent) / 100;
    const newR = Math.round(r * factor);
    const newG = Math.round(g * factor);
    const newB = Math.round(b * factor);

    // Convert back to hex
    return '#' + [newR, newG, newB].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

/**
 * Updates the message text in an existing toast
 * @param {string} messageId - ID of the message element to update
 * @param {string} newMessage - New message text
 */
function updateToastMessage(messageId, newMessage) {
    const messageElement = document.getElementById(messageId);
    if (messageElement) {
        messageElement.textContent = newMessage;
    }
}

/**
 * Removes a toast from the DOM by ID
 * @param {string} id - ID of the toast to remove
 */
function removeToast(id) {
    const existingToast = document.getElementById(id);
    if (existingToast) {
        existingToast.remove();
    }
}

/**
 * Removes ALL toasts from the DOM
 */
function removeAllToasts() {
    document.querySelectorAll('[data-toast]').forEach(el => el.remove());
}

/**
 * Creates a simple informational toast (message + Cancel button)
 * @param {Object} options - Configuration options
 * @param {string} options.message - Message to display
 * @param {Function} options.onCancel - Cancel button handler
 * @param {string} [options.messageId] - Optional message element ID for updates
 * @param {Object} [options.stateRef] - Optional state reference
 * @param {string} [options.borderColor='#6ad1e3'] - Border color
 * @param {string} [options.position='top-right'] - Position: 'top-right', 'top-left', 'bottom-right', 'bottom-left'
 * @returns {HTMLElement} The created toast element
 */
function createInfoToast(options) {
    return createToast({
        message: options.message,
        messageId: options.messageId,
        buttons: [
            {
                label: 'Cancel',
                onClick: options.onCancel,
                type: 'secondary'
            }
        ],
        layout: 'horizontal',
        borderColor: options.borderColor || '#6ad1e3',
        stateRef: options.stateRef,
        position: options.position
    });
}

/**
 * Creates a confirmation toast (message + Yes/No buttons)
 * @param {Object} options - Configuration options
 * @param {string} options.message - Message to display
 * @param {Function} options.onYes - Yes button handler
 * @param {Function} options.onNo - No button handler
 * @param {string} [options.yesLabel='Yes'] - Yes button label
 * @param {string} [options.noLabel='No'] - No button label
 * @param {Object} [options.stateRef] - Optional state reference
 * @param {string} [options.borderColor='#6ad1e3'] - Border color
 * @param {string} [options.primaryColor] - Custom primary button color
 * @param {string} [options.position='top-right'] - Position: 'top-right', 'top-left', 'bottom-right', 'bottom-left'
 * @returns {HTMLElement} The created toast element
 */
function createConfirmToast(options) {
    const borderColor = options.borderColor || '#6ad1e3';
    const primaryColor = options.primaryColor || borderColor;

    return createToast({
        message: options.message,
        buttons: [
            {
                label: options.yesLabel || 'Yes',
                onClick: options.onYes,
                type: 'primary',
                backgroundColor: primaryColor,
                id: options.yesId
            },
            {
                label: options.noLabel || 'No',
                onClick: options.onNo,
                type: 'secondary',
                id: options.noId
            }
        ],
        layout: 'vertical',
        borderColor: borderColor,
        stateRef: options.stateRef,
        position: options.position
    });
}

/**
 * Creates a text input dialog overlay
 * @param {Object} options - Configuration options
 * @param {string} options.id - Unique ID for the overlay
 * @param {string} options.title - Title text for the dialog
 * @param {string} options.placeholder - Placeholder text for input field
 * @param {Function} options.onSubmit - Submit button handler (receives text value)
 * @param {Function} options.onCancel - Cancel button handler
 * @param {number} [options.maxLength=50] - Maximum input length
 * @param {string} [options.borderColor='#6ad1e3'] - Border color
 * @param {Object} [options.stateRef] - Optional state reference
 * @returns {HTMLElement} The created overlay element
 */
function createTextInputDialog(options) {
    const {
        id,
        title,
        placeholder = 'Enter text...',
        onSubmit,
        onCancel,
        maxLength = 50,
        borderColor = '#6ad1e3',
        stateRef = null
    } = options;

    // Remove existing dialog with same ID if any
    removeToast(id);

    // Create overlay for text input
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 15px 20px;
        border: 2px solid ${borderColor};
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        min-width: 250px;
    `;

    const inputId = `${id}-input`;
    const submitId = `${id}-submit`;
    const cancelId = `${id}-cancel`;

    overlay.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #374151; font-size: 14px; font-weight: bold;">${title}</h3>
        <input type="text" id="${inputId}"
               style="width: 100%; padding: 8px; margin-bottom: 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;"
               placeholder="${placeholder}"
               maxlength="${maxLength}">
        <div style="display: flex; gap: 10px;">
            <button id="${submitId}"
                    style="flex: 1; padding: 8px; background: ${borderColor}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                Submit
            </button>
            <button id="${cancelId}"
                    style="flex: 1; padding: 8px; background: #ccc; color: black; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                Cancel
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Store reference if state object provided
    if (stateRef && stateRef.state) {
        const key = stateRef.key || 'textInputOverlay';
        stateRef.state[key] = overlay;
    }

    // Get input element
    const input = document.getElementById(inputId);
    input.focus();

    // Handle submit
    document.getElementById(submitId).addEventListener('click', () => {
        const text = input.value.trim();
        onSubmit(text);  // Allow empty text
    });

    // Handle cancel
    document.getElementById(cancelId).addEventListener('click', onCancel);

    // Handle Enter key
    input.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            const text = input.value.trim();
            onSubmit(text);  // Allow empty text
        }
    });

    // Handle Escape key
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            onCancel();
        }
    });

    return overlay;
}

/**
 * Creates a number input dialog overlay
 * @param {Object} options - Configuration options
 * @param {string} options.id - Unique ID for the overlay
 * @param {string} options.title - Title text for the dialog
 * @param {string} options.placeholder - Placeholder text for input field
 * @param {Function} options.onSubmit - Submit button handler (receives number value)
 * @param {Function} options.onCancel - Cancel button handler
 * @param {number} [options.defaultValue] - Default value to populate
 * @param {number} [options.min] - Minimum allowed value
 * @param {number} [options.max] - Maximum allowed value
 * @param {number|string} [options.step='any'] - Step size for number input
 * @param {string} [options.borderColor='#6ad1e3'] - Border color
 * @param {Object} [options.stateRef] - Optional state reference
 * @returns {HTMLElement} The created overlay element
 */
function createNumberInputDialog(options) {
    const {
        id,
        title,
        placeholder = 'Enter number...',
        onSubmit,
        onCancel,
        defaultValue = '',
        min,
        max,
        step = 'any',
        borderColor = '#6ad1e3',
        stateRef = null
    } = options;

    // Remove existing dialog with same ID if any
    removeToast(id);

    // Create overlay for number input
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 15px 20px;
        border: 2px solid ${borderColor};
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        min-width: 250px;
    `;

    const inputId = `${id}-input`;
    const submitId = `${id}-submit`;
    const cancelId = `${id}-cancel`;

    // Build input attributes
    const minAttr = min !== undefined ? `min="${min}"` : '';
    const maxAttr = max !== undefined ? `max="${max}"` : '';

    overlay.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #374151; font-size: 14px; font-weight: bold;">${title}</h3>
        <input type="number" id="${inputId}"
               style="width: 100%; padding: 8px; margin-bottom: 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;"
               placeholder="${placeholder}"
               step="${step}"
               ${minAttr}
               ${maxAttr}
               value="${defaultValue}">
        <div style="display: flex; gap: 10px;">
            <button id="${submitId}"
                    style="flex: 1; padding: 8px; background: ${borderColor}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                Submit
            </button>
            <button id="${cancelId}"
                    style="flex: 1; padding: 8px; background: #ccc; color: black; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                Cancel
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Store reference if state object provided
    if (stateRef && stateRef.state) {
        const key = stateRef.key || 'numberInputOverlay';
        stateRef.state[key] = overlay;
    }

    // Get input element
    const input = document.getElementById(inputId);
    input.focus();
    input.select();

    // Handle submit
    const handleSubmit = () => {
        const value = parseFloat(input.value);
        if (isNaN(value)) {
            alert('Please enter a valid number');
            return;
        }
        if (min !== undefined && value < min) {
            alert(`Value must be at least ${min}`);
            return;
        }
        if (max !== undefined && value > max) {
            alert(`Value must be at most ${max}`);
            return;
        }
        onSubmit(value);
    };

    document.getElementById(submitId).addEventListener('click', handleSubmit);

    // Handle cancel
    document.getElementById(cancelId).addEventListener('click', onCancel);

    // Handle Enter key
    input.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSubmit();
        }
    });

    // Handle Escape key
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            onCancel();
        }
    });

    return overlay;
}

/**
 * Creates left/right arrow controls for adjusting values
 * @param {Object} options - Configuration options
 * @param {string} options.id - Unique ID for the controls
 * @param {Function} options.onLeft - Left arrow click handler
 * @param {Function} options.onRight - Right arrow click handler
 * @param {string} [options.color='#6ad1e3'] - Arrow button color
 * @param {Object} [options.stateRef] - Optional state reference
 * @returns {HTMLElement} The created controls element
 */
function createArrowControls(options) {
    const {
        id,
        onLeft,
        onRight,
        color = '#6ad1e3',
        stateRef = null
    } = options;

    // Remove existing controls with same ID if any
    removeToast(id);

    // Create arrow control container
    const arrowDiv = document.createElement('div');
    arrowDiv.id = id;
    arrowDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 0;
        right: 0;
        display: flex;
        justify-content: space-between;
        padding: 0 20px;
        z-index: 9999;
        pointer-events: none;
    `;

    // Left arrow
    const leftArrow = document.createElement('button');
    leftArrow.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="white">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
        </svg>
    `;
    leftArrow.style.cssText = `
        width: 60px;
        height: 60px;
        background: ${color};
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        pointer-events: auto;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    // Right arrow
    const rightArrow = document.createElement('button');
    rightArrow.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="white">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
    `;
    rightArrow.style.cssText = `
        width: 60px;
        height: 60px;
        background: ${color};
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        pointer-events: auto;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    // Add click handlers
    leftArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        onLeft();
    });

    rightArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        onRight();
    });

    arrowDiv.appendChild(leftArrow);
    arrowDiv.appendChild(rightArrow);
    document.body.appendChild(arrowDiv);

    // Store reference if state object provided
    if (stateRef && stateRef.state) {
        const key = stateRef.key || 'arrowControls';
        stateRef.state[key] = arrowDiv;
    }

    return arrowDiv;
}

// Export functions as ES modules
export {
    createToast,
    updateToastMessage,
    removeToast,
    removeAllToasts,
    createInfoToast,
    createConfirmToast,
    createTextInputDialog,
    createNumberInputDialog,
    createArrowControls
};

console.log('toaster.js loaded');
