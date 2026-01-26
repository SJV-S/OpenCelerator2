# Project Rules

## File Handling
- **NEVER read .json template files** - they are extremely large and will cause errors
- **NEVER attempt to read files in chart_templates/ directory** - always assume they exist and are too large
- Always ask before reading any .json file anywhere in the project

## Learning
- When explaining code involving JavaScript, HTML, and Flask/Jinja:

1. Always explicitly trace variable and function accessibility across boundaries (client/server, file scope, global scope)
2. State WHERE each variable/function is defined and WHERE it becomes accessible
3. Explain the mechanism that makes something accessible (script tags, window object, Jinja templating, fetch/responses, etc.)
4. For cross-boundary data flow, trace the complete path from origin to destination
5. Distinguish between server-time rendering (Jinja) and client-time execution (JavaScript)
6. Flag scope issues proactively if code assumes accessibility that doesn't exist
7. Identify the type/nature of variables (objects, arrays, primitives, DOM elements, etc.) and relate to Python equivalents when applicable (e.g., "JavaScript object literal = Python dict", "array = list", "undefined/null ≠ None", "Promise = similar to async/await")

Example format:
- Variable X defined in server.py → passed to render_template() → injected into HTML via {{ X }} → accessible in <script> tag as JavaScript variable
- Function Y defined in script.js → attached to window object → callable from inline HTML onclick handlers
- Data Z sent from client via fetch() → received in Flask route → processed → returned in JSON response → parsed in .then() → accessible in JavaScript
