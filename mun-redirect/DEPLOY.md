# Deploy to MUN Server

This folder contains a simple landing page for hosting on MUN's `garfield.cs.mun.ca` server.

## Before You Deploy

**IMPORTANT:** Update the Render.com URL in `index.html` (line 6 and line 85):

```html
<!-- Line 6: Auto-redirect URL -->
<meta http-equiv="refresh" content="3; url=https://YOUR-RENDER-URL.onrender.com">

<!-- Line 85: Manual link URL -->
<a href="https://YOUR-RENDER-URL.onrender.com" class="btn">View My Portfolio</a>
```

Replace `https://promit-portfolio.onrender.com` with your actual Render.com deployment URL.

## Deployment Steps

### Step 1: Connect to MUN Server

From your local machine (or campus lab):

```bash
ssh YOUR_MUN_USERNAME@garfield.cs.mun.ca
```

Replace `YOUR_MUN_USERNAME` with your actual MUN username (e.g., `promitd`).

**Note:** If off-campus, you may need VPN or SSH access configured first.

### Step 2: Create Web Directory

Once connected to garfield:

```bash
cd ~
mkdir .www
chmod 711 .www
```

### Step 3: Upload the HTML File

From your **local machine** (open a new terminal, don't close the SSH connection):

```bash
# Navigate to the mun-redirect folder
cd c:/Users/Promit/Desktop/PersonalPortfolio/mun-redirect

# Upload the file using SCP
scp index.html YOUR_MUN_USERNAME@garfield.cs.mun.ca:~/.www/
```

**Alternative (using SFTP):**

```bash
sftp YOUR_MUN_USERNAME@garfield.cs.mun.ca
cd .www
put index.html
quit
```

### Step 4: Set File Permissions

Back in your SSH session on garfield:

```bash
cd ~/.www
chmod 644 index.html
```

### Step 5: Verify

Your page should now be live at:

```
https://www.cs.mun.ca/~YOUR_MUN_USERNAME/
```

For example: `https://www.cs.mun.ca/~promitd/`

Visit the URL to test the redirect!

## Troubleshooting

### Page shows 403 Forbidden
- Check directory permissions: `chmod 711 ~/.www`
- Check file permissions: `chmod 644 ~/.www/index.html`
- Ensure your home directory is executable: `chmod 711 ~`

### Page not found (404)
- Verify file exists: `ls -la ~/.www/index.html`
- Check filename is exactly `index.html` (case-sensitive)

### Redirect not working
- Verify you updated the URL in `index.html` (lines 6 and 85)
- Clear browser cache and try again

### Can't connect via SSH
- If off-campus, you may need VPN access
- Contact CS Help Desk: helpdesk@cs.mun.ca
- Lab users: Register at the labnet login portal first

## Quick One-Line Deploy

After updating the URL in `index.html`:

```bash
scp index.html YOUR_MUN_USERNAME@garfield.cs.mun.ca:~/.www/ && ssh YOUR_MUN_USERNAME@garfield.cs.mun.ca "chmod 644 ~/.www/index.html && chmod 711 ~/.www && chmod 711 ~"
```

## Support

- **MUN CS Help**: helpdesk@cs.mun.ca
- **Original Guide**: https://www.cs.mun.ca/~jaharrhy/how-to-make-mun-page/
