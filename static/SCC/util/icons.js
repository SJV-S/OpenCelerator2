/**
 * SVG icon definitions for the application
 * Icons accept optional size parameter - if provided, uses fixed width/height
 * If not provided, uses 100% to fill container (CSS controls actual size)
 */

// Helper to generate size attributes
const sizeAttrs = (size) => size
    ? `width="${size}" height="${size}"`
    : 'width="100%" height="100%"';

export const icons = {
    phaseTextTop: (size = null, showText = true) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${sizeAttrs(size)}>
            <line x1="20" y1="20" x2="20" y2="80" stroke="black" stroke-width="3" stroke-linecap="square"/>
            <line x1="20" y1="20" x2="50" y2="20" stroke="black" stroke-width="3" stroke-linecap="square"/>
            ${showText ? '<text x="55" y="23" font-family="Arial, sans-serif" font-size="14" fill="black">TEXT</text>' : ''}
        </svg>
    `,

    phaseTextBottom: (size = null, showText = true) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${sizeAttrs(size)}>
            <line x1="20" y1="20" x2="20" y2="80" stroke="black" stroke-width="3" stroke-linecap="square"/>
            <line x1="20" y1="80" x2="50" y2="80" stroke="black" stroke-width="3" stroke-linecap="square"/>
            ${showText ? '<text x="55" y="83" font-family="Arial, sans-serif" font-size="14" fill="black">TEXT</text>' : ''}
        </svg>
    `,

    aimDiagonal: (size = null, showText = true) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${sizeAttrs(size)}>
            <line x1="20" y1="80" x2="80" y2="20" stroke="black" stroke-width="3" stroke-linecap="square"/>
            ${showText ? '<text x="50" y="44" font-family="Arial, sans-serif" font-size="14" fill="black" text-anchor="middle" transform="rotate(-45 50 44)">TEXT</text>' : ''}
        </svg>
    `,

    aimHorizontal: (size = null, showText = true) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${sizeAttrs(size)}>
            <line x1="20" y1="50" x2="80" y2="50" stroke="black" stroke-width="3" stroke-linecap="square"/>
            ${showText ? '<text x="50" y="45" font-family="Arial, sans-serif" font-size="14" fill="black" text-anchor="middle">TEXT</text>' : ''}
        </svg>
    `,

    otherScissors: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" ${sizeAttrs(size)}>
            <path d="M256 320L216.5 359.5C203.9 354.6 190.3 352 176 352C114.1 352 64 402.1 64 464C64 525.9 114.1 576 176 576C237.9 576 288 525.9 288 464C288 449.7 285.3 436.1 280.5 423.5L563.2 140.8C570.3 133.7 570.3 122.3 563.2 115.2C534.9 86.9 489.1 86.9 460.8 115.2L320 256L280.5 216.5C285.4 203.9 288 190.3 288 176C288 114.1 237.9 64 176 64C114.1 64 64 114.1 64 176C64 237.9 114.1 288 176 288C190.3 288 203.9 285.3 216.5 280.5L256 320zM353.9 417.9L460.8 524.8C489.1 553.1 534.9 553.1 563.2 524.8C570.3 517.7 570.3 506.3 563.2 499.2L417.9 353.9L353.9 417.9zM128 176C128 149.5 149.5 128 176 128C202.5 128 224 149.5 224 176C224 202.5 202.5 224 176 224C149.5 224 128 202.5 128 176zM176 416C202.5 416 224 437.5 224 464C224 490.5 202.5 512 176 512C149.5 512 128 490.5 128 464C128 437.5 149.5 416 176 416z"/>
        </svg>
    `,

    otherCeleration: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 135.47 135.47" ${sizeAttrs(size)}>
            <path d="m4.3015 64.311 87.088-62.48 4.6641 6.5-62.79 45.048 96.739-36.089 2.7949 7.4941-103.92 38.777h102.47v8h-102.52l103.48 38.584-2.7949 7.4961-96.312-35.905 63.312 45.399-4.6641 6.5-87.553-62.824-0.91797-0.91797-0.49805-0.93359-0.2521-1.3975 0.2521-1.3974 0.49805-0.93555 0.91797-0.91797v0"/>
        </svg>
    `,

    otherFlag: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" ${sizeAttrs(size)}>
            <path d="M160 96C160 78.3 145.7 64 128 64C110.3 64 96 78.3 96 96L96 544C96 561.7 110.3 576 128 576C145.7 576 160 561.7 160 544L160 422.4L222.7 403.6C264.6 391 309.8 394.9 348.9 414.5C391.6 435.9 441.4 438.5 486.1 421.7L523.2 407.8C535.7 403.1 544 391.2 544 377.8L544 130.1C544 107.1 519.8 92.1 499.2 102.4L487.4 108.3C442.5 130.8 389.6 130.8 344.6 108.3C308.2 90.1 266.3 86.5 227.4 98.2L160 118.4L160 96z"/>
        </svg>
    `,

    otherCrosshairs: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" ${sizeAttrs(size)}>
            <path d="M320 48C337.7 48 352 62.3 352 80L352 98.3C450.1 112.3 527.7 189.9 541.7 288L560 288C577.7 288 592 302.3 592 320C592 337.7 577.7 352 560 352L541.7 352C527.7 450.1 450.1 527.7 352 541.7L352 560C352 577.7 337.7 592 320 592C302.3 592 288 577.7 288 560L288 541.7C189.9 527.7 112.3 450.1 98.3 352L80 352C62.3 352 48 337.7 48 320C48 302.3 62.3 288 80 288L98.3 288C112.3 189.9 189.9 112.3 288 98.3L288 80C288 62.3 302.3 48 320 48zM163.2 352C175.9 414.7 225.3 464.1 288 476.8L288 464C288 446.3 302.3 432 320 432C337.7 432 352 446.3 352 464L352 476.8C414.7 464.1 464.1 414.7 476.8 352L464 352C446.3 352 432 337.7 432 320C432 302.3 446.3 288 464 288L476.8 288C464.1 225.3 414.7 175.9 352 163.2L352 176C352 193.7 337.7 208 320 208C302.3 208 288 193.7 288 176L288 163.2C225.3 175.9 175.9 225.3 163.2 288L176 288C193.7 288 208 302.3 208 320C208 337.7 193.7 352 176 352L163.2 352zM320 272C346.5 272 368 293.5 368 320C368 346.5 346.5 368 320 368C293.5 368 272 346.5 272 320C272 293.5 293.5 272 320 272z"/>
        </svg>
    `,

    otherTrash: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" ${sizeAttrs(size)}>
            <path d="M232.7 69.9L224 96L128 96C110.3 96 96 110.3 96 128C96 145.7 110.3 160 128 160L512 160C529.7 160 544 145.7 544 128C544 110.3 529.7 96 512 96L416 96L407.3 69.9C402.9 56.8 390.7 48 376.9 48L263.1 48C249.3 48 237.1 56.8 232.7 69.9zM512 208L128 208L149.1 531.1C150.7 556.4 171.7 576 197 576L443 576C468.3 576 489.3 556.4 490.9 531.1L512 208z"/>
        </svg>
    `,

    otherGear: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" ${sizeAttrs(size)}>
            <path d="M259.1 73.5C262.1 58.7 275.2 48 290.4 48L350.2 48C365.4 48 378.5 58.7 381.5 73.5L396 143.5C410.1 149.5 423.3 157.2 435.3 166.3L503.1 143.8C517.5 139 533.3 145 540.9 158.2L570.8 210C578.4 223.2 575.7 239.8 564.3 249.9L511 297.3C511.9 304.7 512.3 312.3 512.3 320C512.3 327.7 511.8 335.3 511 342.7L564.4 390.2C575.8 400.3 578.4 417 570.9 430.1L541 481.9C533.4 495 517.6 501.1 503.2 496.3L435.4 473.8C423.3 482.9 410.1 490.5 396.1 496.6L381.7 566.5C378.6 581.4 365.5 592 350.4 592L290.6 592C275.4 592 262.3 581.3 259.3 566.5L244.9 496.6C230.8 490.6 217.7 482.9 205.6 473.8L137.5 496.3C123.1 501.1 107.3 495.1 99.7 481.9L69.8 430.1C62.2 416.9 64.9 400.3 76.3 390.2L129.7 342.7C128.8 335.3 128.4 327.7 128.4 320C128.4 312.3 128.9 304.7 129.7 297.3L76.3 249.8C64.9 239.7 62.3 223 69.8 209.9L99.7 158.1C107.3 144.9 123.1 138.9 137.5 143.7L205.3 166.2C217.4 157.1 230.6 149.5 244.6 143.4L259.1 73.5zM320.3 400C364.5 399.8 400.2 363.9 400 319.7C399.8 275.5 363.9 239.8 319.7 240C275.5 240.2 239.8 276.1 240 320.3C240.2 364.5 276.1 400.2 320.3 400z"/>
        </svg>
    `,

    otherCamera: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" ${sizeAttrs(size)}>
            <path d="M213.1 128.8L202.7 160L128 160C92.7 160 64 188.7 64 224L64 480C64 515.3 92.7 544 128 544L512 544C547.3 544 576 515.3 576 480L576 224C576 188.7 547.3 160 512 160L437.3 160L426.9 128.8C420.4 109.2 402.1 96 381.4 96L258.6 96C237.9 96 219.6 109.2 213.1 128.8zM320 256C373 256 416 299 416 352C416 405 373 448 320 448C267 448 224 405 224 352C224 299 267 256 320 256z"/>
        </svg>
    `,

    csvExportSvgIcon: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" ${sizeAttrs(size)}>
            <path d="M128 64C92.7 64 64 92.7 64 128L64 512C64 547.3 92.7 576 128 576L208 576L208 464C208 428.7 236.7 400 272 400L448 400L448 234.5C448 217.5 441.3 201.2 429.3 189.2L322.7 82.7C310.7 70.7 294.5 64 277.5 64L128 64zM389.5 240L296 240C282.7 240 272 229.3 272 216L272 122.5L389.5 240zM296 444C271.7 444 252 463.7 252 488L252 568C252 592.3 271.7 612 296 612L312 612C336.3 612 356 592.3 356 568L356 560C356 549 347 540 336 540C325 540 316 549 316 560L316 568C316 570.2 314.2 572 312 572L296 572C293.8 572 292 570.2 292 568L292 488C292 485.8 293.8 484 296 484L312 484C314.2 484 316 485.8 316 488L316 496C316 507 325 516 336 516C347 516 356 507 356 496L356 488C356 463.7 336.3 444 312 444L296 444zM432 444C403.3 444 380 467.3 380 496C380 524.7 403.3 548 432 548C438.6 548 444 553.4 444 560C444 566.6 438.6 572 432 572L400 572C389 572 380 581 380 592C380 603 389 612 400 612L432 612C460.7 612 484 588.7 484 560C484 531.3 460.7 508 432 508C425.4 508 420 502.6 420 496C420 489.4 425.4 484 432 484L456 484C467 484 476 475 476 464C476 453 467 444 456 444L432 444zM528 444C517 444 508 453 508 464L508 495.6C508 531.1 518.5 565.9 538.2 595.4L543.3 603.1C547 608.7 553.3 612 559.9 612C566.5 612 572.8 608.7 576.5 603.1L581.6 595.4C601.3 565.8 611.8 531.1 611.8 495.6L611.8 464C611.8 453 602.8 444 591.8 444C580.8 444 571.8 453 571.8 464L571.8 495.6C571.8 515.2 567.7 534.5 559.8 552.3C551.9 534.5 547.8 515.2 547.8 495.6L547.8 464C547.8 453 538.8 444 527.8 444z"/>
        </svg>
    `,

    // Legend marker icons - all standardized to 20x20 container
    markerCircle: (size = 20, fillColor = 'black', strokeColor = 'black') => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
            <circle cx="10" cy="10" r="${Math.min(size/2, 9)}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1"/>
        </svg>
    `,

    markerSquare: (size = 20, fillColor = 'black', strokeColor = 'black') => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
            <rect x="${10 - Math.min(size/2, 9)}" y="${10 - Math.min(size/2, 9)}" width="${Math.min(size, 18)}" height="${Math.min(size, 18)}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1"/>
        </svg>
    `,

    markerTriangle: (size = 20, fillColor = 'black', strokeColor = 'black') => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
            <polygon points="10,${10 - Math.min(size/2, 9)} ${10 + Math.min(size/2, 9)},${10 + Math.min(size/2, 9)} ${10 - Math.min(size/2, 9)},${10 + Math.min(size/2, 9)}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1"/>
        </svg>
    `,

    markerDiamond: (size = 20, fillColor = 'black', strokeColor = 'black') => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
            <polygon points="10,${10 - Math.min(size/2, 9)} ${10 + Math.min(size/2, 9)},10 10,${10 + Math.min(size/2, 9)} ${10 - Math.min(size/2, 9)},10" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1"/>
        </svg>
    `,

    markerX: (size = 20, color = 'black') => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
            <text x="10" y="10" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(size, 18)}" font-family="Arial" fill="${color}">X</text>
        </svg>
    `,

    markerDash: (size = 20, color = 'black') => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
            <text x="10" y="10" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(size, 18)}" font-family="Arial" fill="${color}">−</text>
        </svg>
    `,

    // Chevron for expandable sections
    chevronDown: (size = 16) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="${size}" height="${size}">
            <path d="M5 7L10 12L15 7" stroke="black" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `,

    // Grid icon for legend
    grid: (size = 20) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="8" y1="3" x2="8" y2="21"/>
            <line x1="16" y1="3" x2="16" y2="21"/>
            <line x1="3" y1="8" x2="21" y2="8"/>
            <line x1="3" y1="16" x2="21" y2="16"/>
        </svg>
    `,

    // Scatter line icon (regression line with data points)
    scatterLine: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" ${sizeAttrs(size)}>
            <line x1="20" y1="165" x2="180" y2="35" stroke="black" stroke-width="8"/>
            <circle cx="40" cy="175" r="8" fill="none" stroke="black" stroke-width="4"/>
            <circle cx="65" cy="100" r="8" fill="none" stroke="black" stroke-width="4"/>
            <circle cx="95" cy="130" r="8" fill="none" stroke="black" stroke-width="4"/>
            <circle cx="120" cy="55" r="8" fill="none" stroke="black" stroke-width="4"/>
            <circle cx="145" cy="90" r="8" fill="none" stroke="black" stroke-width="4"/>
            <circle cx="175" cy="15" r="8" fill="none" stroke="black" stroke-width="4"/>
        </svg>
    `,

    shareLink: (size = null) => `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" ${sizeAttrs(size)}>
            <path d="M451.5 160C434.9 160 418.8 164.5 404.7 172.7C388.9 156.7 370.5 143.3 350.2 133.2C378.4 109.2 414.3 96 451.5 96C537.9 96 608 166 608 252.5C608 294 591.5 333.8 562.2 363.1L491.1 434.2C461.8 463.5 422 480 380.5 480C294.1 480 224 410 224 323.5C224 322 224 320.5 224.1 319C224.6 301.3 239.3 287.4 257 287.9C274.7 288.4 288.6 303.1 288.1 320.8C288.1 321.7 288.1 322.6 288.1 323.4C288.1 374.5 329.5 415.9 380.6 415.9C405.1 415.9 428.6 406.2 446 388.8L517.1 317.7C534.4 300.4 544.2 276.8 544.2 252.3C544.2 201.2 502.8 159.8 451.7 159.8zM307.2 237.3C305.3 236.5 303.4 235.4 301.7 234.2C289.1 227.7 274.7 224 259.6 224C235.1 224 211.6 233.7 194.2 251.1L123.1 322.2C105.8 339.5 96 363.1 96 387.6C96 438.7 137.4 480.1 188.5 480.1C205 480.1 221.1 475.7 235.2 467.5C251 483.5 269.4 496.9 289.8 507C261.6 530.9 225.8 544.2 188.5 544.2C102.1 544.2 32 474.2 32 387.7C32 346.2 48.5 306.4 77.8 277.1L148.9 206C178.2 176.7 218 160.2 259.5 160.2C346.1 160.2 416 230.8 416 317.1C416 318.4 416 319.7 416 321C415.6 338.7 400.9 352.6 383.2 352.2C365.5 351.8 351.6 337.1 352 319.4C352 318.6 352 317.9 352 317.1C352 283.4 334 253.8 307.2 237.5z"/>
        </svg>
    `
};
