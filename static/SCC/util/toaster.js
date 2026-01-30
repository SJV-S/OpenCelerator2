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
const activeToasts = {};

/**
 * Gets base offset values for each position
 * @param {string} position - Position key
 * @returns {Object} Base offsets {top, right, left, bottom}
 * @private
 */
function getPositionOffsets(position) {
    switch (position) {
        case 'top-right':
            return { top: 10, right: 10, left: null, bottom: null };
        case 'top-left':
            return { top: 10, right: null, left: 10, bottom: null };
        case 'bottom-right':
            return { top: null, right: 10, left: null, bottom: 10 };
        case 'bottom-left':
            return { top: null, right: null, left: 10, bottom: 10 };
        default:
            return { top: 10, right: 10, left: null, bottom: null };
    }
}

/**
 * Ensures tracking array exists for a position
 * @param {string} position - Position key
 * @private
 */
function ensureTrackingArray(position) {
    if (!activeToasts[position]) {
        activeToasts[position] = [];
    }
}

const TOAST_GAP = 10;

/**
 * Recalculates and applies positions for all toasts at a position
 * @param {string} position - Position key
 */
function repositionToasts(position) {
    const toasts = activeToasts[position] || [];
    const isBottomPosition = position.startsWith('bottom');
    const baseOffsets = getPositionOffsets(position);
    let offset = 0;

    toasts.forEach((toast, index) => {
        const height = toast.offsetHeight || toast._expectedHeight || 60;

        if (isBottomPosition) {
            toast.style.top = 'auto';
            toast.style.bottom = `${baseOffsets.bottom + offset}px`;
        } else {
            toast.style.top = `${baseOffsets.top + offset}px`;
            toast.style.bottom = 'auto';
        }

        offset += height + TOAST_GAP;
    });
}

/**
 * Removes a toast from tracking and repositions remaining toasts
 * @param {HTMLElement} toast - Toast element
 * @param {string} position - Position key
 */
function untrackToast(toast, position) {
    if (!activeToasts[position]) return;

    const index = activeToasts[position].indexOf(toast);
    if (index > -1) {
        activeToasts[position].splice(index, 1);
        repositionToasts(position);
    }
}

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
        duration = null,
        stateRef = null,
        position = 'top-right'
    } = options;

    // Calculate position BEFORE creating element
    ensureTrackingArray(position);
    const baseOffsets = getPositionOffsets(position);
    const isBottomPosition = position.startsWith('bottom');
    const isRightSide = position === 'top-right' || position === 'bottom-right';

    // Calculate stack offset from existing toasts
    let stackOffset = 0;
    activeToasts[position].forEach(existingToast => {
        const height = existingToast.offsetHeight || existingToast._expectedHeight || 60;
        stackOffset += height + TOAST_GAP;
    });

    // Calculate final position values
    const topValue = isBottomPosition ? 'auto' : `${baseOffsets.top + stackOffset}px`;
    const bottomValue = isBottomPosition ? `${baseOffsets.bottom + stackOffset}px` : 'auto';
    const rightValue = baseOffsets.right !== null ? `${baseOffsets.right}px` : 'auto';
    const leftValue = baseOffsets.left !== null ? `${baseOffsets.left}px` : 'auto';

    // Create toast element
    const toast = document.createElement('div');
    toast.setAttribute('data-toast', 'true');
    toast.dataset.position = position;

    // Determine slide direction based on position
    const slideDirection = isRightSide ? 'calc(100% + 10px)' : 'calc(-100% - 10px)';

    // Toast styles - position values calculated above
    const baseStyles = `
        position: fixed;
        z-index: 10000;
        top: ${topValue};
        bottom: ${bottomValue};
        right: ${rightValue};
        left: ${leftValue};
        background-color: white;
        border: 2px solid ${borderColor};
        border-radius: 8px;
        padding: 12px 16px;
        display: flex;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        font-family: Arial, sans-serif;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(${slideDirection});
        transition: transform 0.3s ease-out, opacity 0.3s ease-out, top 0.2s ease-out;
    `;

    // Layout-specific styles
    const layoutStyles = layout === 'horizontal'
        ? 'align-items: center; gap: 12px;'
        : 'flex-direction: column; gap: 12px; min-width: 200px;';

    toast.style.cssText = baseStyles + layoutStyles;

    // Create message element
    const messageElement = document.createElement(layout === 'horizontal' ? 'span' : 'div');
    messageElement.textContent = message;
    messageElement.style.cssText = `
        color: #374151;
        font-size: 14px;
        font-weight: 500;
    `;

    toast.appendChild(messageElement);

    // Store message element reference on toast for later updates
    toast.messageElement = messageElement;

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
                    toast.remove();
                }
            };
            const button = createButton(wrappedConfig, borderColor);
            buttonContainer.appendChild(button);
        });

        if (layout === 'vertical') {
            toast.appendChild(buttonContainer);
        }
    }

    // Store expected height for repositioning calculations
    toast._expectedHeight = 60;

    // Add to tracking array
    activeToasts[position].push(toast);

    // Append toast to body (position already set in styles)
    document.body.appendChild(toast);

    // Override remove to auto-untrack and reposition remaining toasts
    const originalRemove = toast.remove.bind(toast);
    toast.remove = () => {
        untrackToast(toast, position);
        originalRemove();
    };

    // Trigger slide-in animation and reposition after render (to get actual heights)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
            repositionToasts(position);
        });
    });

    // Store reference if state object provided
    if (stateRef && stateRef.state) {
        const key = stateRef.key || 'toastElement';
        stateRef.state[key] = toast;
    }

    // Auto-dismiss after duration if specified
    if (duration && duration > 0) {
        setTimeout(() => {
            toast.remove();
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
 * @param {HTMLElement} toast - The toast element (must have messageElement property)
 * @param {string} newMessage - New message text
 */
function updateToastMessage(toast, newMessage) {
    if (toast && toast.messageElement) {
        toast.messageElement.textContent = newMessage;
    }
}


/**
 * Removes ALL toasts from the DOM
 */
function removeAllToasts() {
    document.querySelectorAll('[data-toast]').forEach(el => el.remove());
    // Clear all tracking arrays
    Object.keys(activeToasts).forEach(position => {
        activeToasts[position] = [];
    });
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
                backgroundColor: primaryColor
            },
            {
                label: options.noLabel || 'No',
                onClick: options.onNo,
                type: 'secondary'
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
 * @param {string} options.title - Title text for the dialog
 * @param {string} options.placeholder - Placeholder text for input field
 * @param {Function} options.onSubmit - Submit button handler (receives text value)
 * @param {Function} options.onCancel - Cancel button handler
 * @param {number} [options.maxLength=50] - Maximum input length
 * @param {string} [options.borderColor='#6ad1e3'] - Border color
 * @param {Object} [options.stateRef] - Optional state reference
 * @param {string} [options.position='top-right'] - Position for stacking
 * @returns {HTMLElement} The created overlay element
 */
function createTextInputDialog(options) {
    const {
        title,
        placeholder = 'Enter text...',
        onSubmit,
        onCancel,
        maxLength = 50,
        borderColor = '#6ad1e3',
        stateRef = null,
        position = 'top-right'
    } = options;

    // Calculate position before creating element
    ensureTrackingArray(position);
    const baseOffsets = getPositionOffsets(position);
    const isBottomPosition = position.startsWith('bottom');
    const isRightSide = position === 'top-right' || position === 'bottom-right';

    let stackOffset = 0;
    activeToasts[position].forEach(existingToast => {
        const height = existingToast.offsetHeight || existingToast._expectedHeight || 60;
        stackOffset += height + TOAST_GAP;
    });

    const topValue = isBottomPosition ? 'auto' : `${baseOffsets.top + stackOffset}px`;
    const bottomValue = isBottomPosition ? `${baseOffsets.bottom + stackOffset}px` : 'auto';
    const rightValue = baseOffsets.right !== null ? `${baseOffsets.right}px` : 'auto';
    const leftValue = baseOffsets.left !== null ? `${baseOffsets.left}px` : 'auto';
    const slideDirection = isRightSide ? 'calc(100% + 10px)' : 'calc(-100% - 10px)';

    // Create overlay for text input
    const overlay = document.createElement('div');
    overlay.setAttribute('data-toast', 'true');
    overlay.dataset.position = position;

    overlay.style.cssText = `
        position: fixed;
        z-index: 10000;
        top: ${topValue};
        bottom: ${bottomValue};
        right: ${rightValue};
        left: ${leftValue};
        background: white;
        padding: 15px 20px;
        border: 2px solid ${borderColor};
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        min-width: 250px;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(${slideDirection});
        transition: transform 0.3s ease-out, opacity 0.3s ease-out, top 0.2s ease-out;
    `;

    // Create elements
    const heading = document.createElement('h3');
    heading.style.cssText = 'margin: 0 0 10px 0; color: #374151; font-size: 14px; font-weight: bold;';
    heading.textContent = title;

    const input = document.createElement('input');
    input.type = 'text';
    input.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;';
    input.placeholder = placeholder;
    input.maxLength = maxLength;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 10px;';

    const submitBtn = document.createElement('button');
    submitBtn.style.cssText = `flex: 1; padding: 8px; background: ${borderColor}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;`;
    submitBtn.textContent = 'Submit';

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex: 1; padding: 8px; background: #ccc; color: black; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;';
    cancelBtn.textContent = 'Cancel';

    buttonContainer.appendChild(submitBtn);
    buttonContainer.appendChild(cancelBtn);
    overlay.appendChild(heading);
    overlay.appendChild(input);
    overlay.appendChild(buttonContainer);

    // Add to tracking and append to body
    overlay._expectedHeight = 60;
    activeToasts[position].push(overlay);
    document.body.appendChild(overlay);

    // Override remove to auto-untrack
    const originalRemove = overlay.remove.bind(overlay);
    overlay.remove = () => {
        untrackToast(overlay, position);
        originalRemove();
    };

    // Trigger slide-in animation and reposition after render
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            overlay.style.transform = 'translateX(0)';
            repositionToasts(position);
        });
    });

    // Store reference if state object provided
    if (stateRef && stateRef.state) {
        const key = stateRef.key || 'textInputOverlay';
        stateRef.state[key] = overlay;
    }

    input.focus();

    // Handle submit
    submitBtn.addEventListener('click', () => {
        const text = input.value.trim();
        onSubmit(text);  // Allow empty text
    });

    // Handle cancel
    cancelBtn.addEventListener('click', onCancel);

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
 * @param {string} [options.position='top-right'] - Position for stacking
 * @returns {HTMLElement} The created overlay element
 */
function createNumberInputDialog(options) {
    const {
        title,
        placeholder = 'Enter number...',
        onSubmit,
        onCancel,
        defaultValue = '',
        min,
        max,
        step = 'any',
        borderColor = '#6ad1e3',
        stateRef = null,
        position = 'top-right'
    } = options;

    // Calculate position before creating element
    ensureTrackingArray(position);
    const baseOffsets = getPositionOffsets(position);
    const isBottomPosition = position.startsWith('bottom');
    const isRightSide = position === 'top-right' || position === 'bottom-right';

    let stackOffset = 0;
    activeToasts[position].forEach(existingToast => {
        const height = existingToast.offsetHeight || existingToast._expectedHeight || 60;
        stackOffset += height + TOAST_GAP;
    });

    const topValue = isBottomPosition ? 'auto' : `${baseOffsets.top + stackOffset}px`;
    const bottomValue = isBottomPosition ? `${baseOffsets.bottom + stackOffset}px` : 'auto';
    const rightValue = baseOffsets.right !== null ? `${baseOffsets.right}px` : 'auto';
    const leftValue = baseOffsets.left !== null ? `${baseOffsets.left}px` : 'auto';
    const slideDirection = isRightSide ? 'calc(100% + 10px)' : 'calc(-100% - 10px)';

    // Create overlay for number input
    const overlay = document.createElement('div');
    overlay.setAttribute('data-toast', 'true');
    overlay.dataset.position = position;

    overlay.style.cssText = `
        position: fixed;
        z-index: 10000;
        top: ${topValue};
        bottom: ${bottomValue};
        right: ${rightValue};
        left: ${leftValue};
        background: white;
        padding: 15px 20px;
        border: 2px solid ${borderColor};
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        min-width: 250px;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(${slideDirection});
        transition: transform 0.3s ease-out, opacity 0.3s ease-out, top 0.2s ease-out;
    `;

    // Create elements
    const heading = document.createElement('h3');
    heading.style.cssText = 'margin: 0 0 10px 0; color: #374151; font-size: 14px; font-weight: bold;';
    heading.textContent = title;

    const input = document.createElement('input');
    input.type = 'number';
    input.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;';
    input.placeholder = placeholder;
    input.step = step;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    if (defaultValue !== '') input.value = defaultValue;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 10px;';

    const submitBtn = document.createElement('button');
    submitBtn.style.cssText = `flex: 1; padding: 8px; background: ${borderColor}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;`;
    submitBtn.textContent = 'Submit';

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex: 1; padding: 8px; background: #ccc; color: black; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;';
    cancelBtn.textContent = 'Cancel';

    buttonContainer.appendChild(submitBtn);
    buttonContainer.appendChild(cancelBtn);
    overlay.appendChild(heading);
    overlay.appendChild(input);
    overlay.appendChild(buttonContainer);

    // Add to tracking and append to body
    overlay._expectedHeight = 60;
    activeToasts[position].push(overlay);
    document.body.appendChild(overlay);

    // Override remove to auto-untrack
    const originalRemove = overlay.remove.bind(overlay);
    overlay.remove = () => {
        untrackToast(overlay, position);
        originalRemove();
    };

    // Trigger slide-in animation and reposition after render
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            overlay.style.transform = 'translateX(0)';
            repositionToasts(position);
        });
    });

    // Store reference if state object provided
    if (stateRef && stateRef.state) {
        const key = stateRef.key || 'numberInputOverlay';
        stateRef.state[key] = overlay;
    }

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

    submitBtn.addEventListener('click', handleSubmit);

    // Handle cancel
    cancelBtn.addEventListener('click', onCancel);

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
 * @param {Function} options.onLeft - Left arrow click handler
 * @param {Function} options.onRight - Right arrow click handler
 * @param {string} [options.color='#6ad1e3'] - Arrow button color
 * @param {Object} [options.stateRef] - Optional state reference
 * @returns {HTMLElement} The created controls element
 */
function createArrowControls(options) {
    const {
        onLeft,
        onRight,
        color = '#6ad1e3',
        stateRef = null
    } = options;

    // Create arrow control container
    const arrowDiv = document.createElement('div');
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
    removeAllToasts,
    createInfoToast,
    createConfirmToast,
    createTextInputDialog,
    createNumberInputDialog,
    createArrowControls
};

console.log('toaster.js loaded');
