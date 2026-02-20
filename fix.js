const fs = require('fs');
let html = fs.readFileSync('views/resume-tutorial.html', 'utf8');

const btnHtml = `<div class="mt-4 text-center pb-4"><button onclick="printTemplate(this)" class="bg-oxford-blue text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-light-sea-green transition-colors" style="background-color:#0a2540">⬇️ Download / Print Template</button></div>`;

// Add buttons
html = html.replace(/<\/article>/g, btnHtml + '\n                </article>');

const scriptHtml = `
<!-- Template Print Script -->
<script>
function printTemplate(btn) {
    const article = btn.closest('article');
    if (!article) return;
    
    // Resume tutorials
    const badge = article.querySelector('.template-badge');
    const templateName = badge ? badge.innerText : 'Resume Template';
    
    const resumeEl = article.querySelector('.template-resume');
    if (!resumeEl) return;
    const resumeHtml = resumeEl.outerHTML;
    
    let styles = '';
    try {
        styles = Array.from(document.styleSheets)
            .filter(s => s.href && s.href.includes('resume-tutorial'))
            .map(s => \`<link rel="stylesheet" href="\${s.href}">\`)
            .join('');
    } catch(e) {}

    const printWindow = window.open('', '_blank');
    printWindow.document.write(\`
        <!DOCTYPE html>
        <html>
        <head>
            <title>\${templateName}</title>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
            \${styles}
            <style>
                @page { margin: 0; size: letter portrait; }
                body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .template-resume { padding: 40px; box-shadow: none !important; border: none !important; transform: none !important; }
            </style>
        </head>
        <body>
            \${resumeHtml}
            <script>setTimeout(() => window.print(), 800);<\\/script>
        </body>
        </html>
    \`);
    printWindow.document.close();
}
</script>
`;

if (!html.includes('printTemplate(btn)')) {
    html = html.replace('</body>', scriptHtml + '</body>');
}

fs.writeFileSync('views/resume-tutorial.html', html);
console.log('Successfully added download buttons and script.');
