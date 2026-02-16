# Personal Portfolio - Promit Das

A modern, full-stack portfolio website with dynamic content management and static site generation capabilities.

## Features

- 🎨 Modern, responsive design with dark gradient theme
- 📝 Blog system with markdown support
- 💼 Project showcase with detailed pages
- 🔐 Inline authenticated editing directly on each page
- 📧 Contact form with email integration
- 🚀 Static site generation for easy deployment
- 🎮 Interactive Pac-Man game section

## Tech Stack

- **Backend:** Node.js, Express-like routing (vanilla http module)
- **Frontend:** HTML, CSS (custom design system)
- **Database:** File-based JSON storage
- **Email:** Nodemailer
- **Security:** PBKDF2 password hashing, session management

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

A `.env` file has been created with your current credentials. **IMPORTANT:** This file contains sensitive information and should never be committed to version control.

The `.env` file includes:
- Inline editor credentials
- Email configuration for contact form
- Server port

To use different credentials or deploy to production, edit the `.env` file:

```bash
# Edit the .env file with your preferred editor
notepad .env  # Windows
nano .env     # Linux/Mac
```

For reference, see `.env.example` for the required environment variables.

### 3. Run the Development Server

```bash
npm start
```

The server will start at `http://localhost:3000`

### 4. Build Static Site (Optional)

For deployment to static hosting (Netlify, Vercel, etc.):

```bash
npm run build
```

This generates a `dist/` folder with static HTML files.

## Inline Editing

There is no separate `/admin` dashboard. To edit content:

1. Open any page on the site
2. Click `Admin login` (floating button)
3. Sign in with credentials from `.env`
4. Click `Edit site`, edit in place, then click `Save`

For blog/projects, `New post` and `New project` actions are available directly in edit mode.

## Project Structure

```
PersonalPortfolio/
├── server.js           # Main server with routing and inline editing API
├── build.js            # Static site generator
├── lib/
│   ├── data.js         # Data loading and markdown utilities
│   └── templates.js    # Template rendering engine
├── views/              # HTML templates
│   ├── index.html      # Home page
│   ├── about.html      # About page
│   ├── projects.html   # Projects listing
│   ├── project.html    # Individual project page
│   ├── blog.html       # Blog listing
│   ├── post.html       # Individual blog post
│   ├── contact.html    # Contact form
│   └── partials/       # Reusable components
├── data/               # JSON data files
│   ├── projects.json   # Project data
│   └── posts.json      # Blog post data
├── public/             # Static assets (CSS, JS, images)
│   ├── styles.css      # Main stylesheet
│   ├── script.js       # Client-side JavaScript
│   ├── images/         # Images
│   └── resume/         # Resume PDF
└── dist/               # Generated static site (after build)
```

## Security Notes

### ✅ Completed Security Fixes

1. **Removed hardcoded credentials** - All credentials now use environment variables
2. **Added .env to .gitignore** - Prevents accidental credential exposure
3. **Created .env.example** - Template for required environment variables

### 🔒 Additional Security Recommendations

1. **Change default credentials** before deploying to production
2. **Use strong passwords** (minimum 8 characters with uppercase, lowercase, numbers, and special characters)
3. **Configure email settings** with real SMTP credentials for the contact form
4. **Add rate limiting** to admin endpoints (future enhancement)
5. **Use HTTPS** in production

## Deployment

### Static Deployment (Netlify, Vercel, GitHub Pages)

1. Build the static site:
   ```bash
   npm run build
   ```

2. Deploy the `dist/` folder

### Dynamic Deployment (Heroku, AWS, DigitalOcean)

1. Set environment variables in your hosting platform
2. Deploy the entire project
3. Run `npm start`

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `ADMIN_USERNAME` | Inline editor username | Yes |
| `ADMIN_PASSWORD` | Inline editor password | Yes |
| `ADMIN_RECOVERY_CODE` | Password recovery code | Yes |
| `EMAIL_HOST` | SMTP server hostname | For contact form |
| `EMAIL_PORT` | SMTP server port | For contact form |
| `EMAIL_USER` | SMTP username | For contact form |
| `EMAIL_PASS` | SMTP password | For contact form |
| `EMAIL_TO` | Email address to receive contact form submissions | For contact form |
| `PORT` | Server port (default: 3000) | No |

## Adding Content

### Adding a New Project

Edit `data/projects.json` and add a new project object:

```json
{
  "id": 3,
  "slug": "my-project",
  "title": "My Project",
  "description": "Short description",
  "technologies": ["React", "Node.js"],
  "link": "https://github.com/username/repo",
  "image": "/public/images/project.png",
  "highlights": ["Feature 1", "Feature 2"],
  "content": "<p>Full HTML content here</p>"
}
```

### Adding a New Blog Post

Use inline edit mode on `/blog` (click `Admin login`) or edit `data/posts.json` directly.

## Troubleshooting

### "Email not sending"
- Check your `EMAIL_*` environment variables
- Some email providers (Gmail) require "App Passwords" instead of regular passwords
- Verify SMTP settings with your email provider

### "Inline login not working"
- Verify credentials in `.env` file
- Check that `.env` file is in the root directory
- Restart the server after changing `.env`

### "Resume PDF not downloading"
- Ensure the PDF exists at `public/resume/Promit-Das-Resume.pdf`
- Check file permissions

## License

MIT

## Contact

- **Email:** promitd@mun.ca
- **LinkedIn:** [linkedin.com/in/promitd](https://www.linkedin.com/in/promitd)
- **GitHub:** [github.com/promitdas345](https://github.com/promitdas345)
