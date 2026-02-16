const fs = require('fs/promises');
const path = require('path');

function createRenderer(viewsDir) {
  return async function renderTemplate(templateName, variables = {}) {
    const filePath = path.join(viewsDir, templateName);
    let content;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      throw new Error(`Template not found: ${templateName}`);
    }
    return content.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, key) => {
      return key in variables ? String(variables[key]) : '';
    });
  };
}

module.exports = { createRenderer };
