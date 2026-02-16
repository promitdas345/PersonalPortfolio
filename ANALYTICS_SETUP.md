# Analytics Setup Guide

## Overview
Your portfolio now tracks visitor behavior using **Google Analytics 4** with custom event tracking for key interactions.

## Quick Setup

### 1. Create Google Analytics 4 Account
1. Go to [Google Analytics](https://analytics.google.com)
2. Click "Start measuring" or "Admin" → "Create Property"
3. Follow setup wizard:
   - Property name: "Promit's Portfolio"
   - Timezone: Your timezone
   - Currency: Your currency
4. Create a **Web data stream**:
   - Website URL: Your deployed site URL
   - Stream name: "Portfolio Website"
5. Copy your **Measurement ID** (format: `G-XXXXXXXXXX`)

### 2. Configure Environment Variable
1. Open your `.env` file (or create from `.env.example`)
2. Add your Measurement ID:
   ```
   GA_MEASUREMENT_ID=G-XXXXXXXXXX
   ```
3. Restart your server: `npm start`

### 3. Verify Tracking
1. Visit your website
2. Open Google Analytics → Reports → Realtime
3. You should see yourself as an active user
4. Wait 24-48 hours for full reports to populate

## What's Being Tracked

### Automatic Events
- **Page views** - Every page visit with URL and title
- **Session data** - User sessions, duration, bounce rate
- **Traffic sources** - How users find your site (direct, search, referral)
- **Geographic data** - Visitor locations (city, country)
- **Device info** - Desktop vs mobile, browser, OS

### Custom Events (Key Actions)

| Event Name | Triggered When | Data Captured |
|------------|----------------|---------------|
| `resume_download` | User downloads your resume PDF | File name |
| `social_link_click` | Click on GitHub, LinkedIn, email | Platform (GitHub/LinkedIn/Email) |
| `project_view` | Click to view a project | Project title, URL |
| `blog_post_view` | Click to read a blog post | Post title, URL |
| `contact_form_submit` | Submit contact form | Form submission event |
| `time_on_page` | Every 30s, 1min, 3min, 5min | Duration milestones |
| `scroll_depth` | Scroll 25%, 50%, 75%, 100% | Scroll percentage |
| `video_play` | Play embedded video | Video title/URL |
| `pacman_game_start` | Start playing Pac-Man | Game interaction |

### Privacy Features
- **IP anonymization enabled** - User IPs are anonymized
- **No tracking without GA ID** - If `GA_MEASUREMENT_ID` is empty, no tracking scripts load
- **GDPR-friendly** - Uses Google's privacy-safe defaults

## Viewing Your Data

### Real-time Dashboard
- **Path**: Reports → Realtime
- **Shows**: Active users right now, what pages they're viewing, geographic location

### Key Reports to Check

1. **Traffic Overview**
   - Reports → Acquisition → Traffic acquisition
   - See: Direct, Organic Search, Referral traffic

2. **Popular Pages**
   - Reports → Engagement → Pages and screens
   - See: Most visited pages, average time on page

3. **Custom Events**
   - Reports → Engagement → Events
   - See: All your custom events (resume downloads, project views, etc.)
   - Click any event to see detailed breakdown

4. **User Demographics**
   - Reports → User → Demographics
   - See: Geographic locations, languages, devices

5. **Conversion Funnel** (For Amazon recruiters)
   - Track: Homepage → Projects → Resume Download
   - Reports → Explore → Create custom funnel

## Recommended Setup for Amazon SDE Co-op Goal

### Create Custom Exploration
1. Go to Explore → Create new exploration
2. Add these segments:
   - Users who downloaded resume
   - Users who viewed 3+ projects
   - Users who spent 3+ minutes
3. Track conversion path: Landing → Projects → About → Resume

### Set up Goals
1. Admin → Data display → Events
2. Mark as conversions:
   - `resume_download` ✅
   - `contact_form_submit` ✅
3. These will appear in "Conversions" report

### Weekly Review Checklist
- [ ] Check total visitors (goal: growth week-over-week)
- [ ] Check resume downloads (high-intent visitors)
- [ ] Check average time on page (engagement quality)
- [ ] Check traffic sources (is LinkedIn working?)
- [ ] Review top blog posts (what content resonates?)

## Sharing Metrics with Recruiters

When Amazon recruiters ask "How much traffic does your portfolio get?", pull these stats:

1. **Monthly Visitors**: Reports → Acquisition → Overview
2. **Average Session Duration**: Reports → Engagement → Overview
3. **Resume Downloads**: Reports → Engagement → Events → Filter "resume_download"
4. **Most Popular Projects**: Reports → Engagement → Events → Filter "project_view"

## Troubleshooting

### Analytics not working?
1. Check `.env` has correct `GA_MEASUREMENT_ID=G-XXXXXXXXXX`
2. Restart server after adding GA ID
3. Check browser console for errors
4. Visit site in incognito (some ad blockers block GA)
5. Wait 24-48 hours for data to appear in reports

### No custom events showing?
1. Check Reports → Realtime → Event count by Event name
2. Trigger an action (download resume, click project)
3. Should appear in real-time within seconds
4. Historical reports take 24-48 hours

### Want to disable tracking?
1. Remove or empty `GA_MEASUREMENT_ID` from `.env`
2. Restart server
3. No analytics scripts will load

## Cost
- **Google Analytics 4 is FREE** for up to 10 million events/month
- Your portfolio will likely use <1,000 events/month
- No credit card required

## Privacy Compliance
- Analytics partial includes `anonymize_ip: true`
- No personally identifiable information (PII) is collected
- Complies with GDPR, CCPA out of the box
- If you need a privacy policy page, many free generators available

## Next Steps
1. ✅ Set up GA4 account
2. ✅ Add `GA_MEASUREMENT_ID` to `.env`
3. ✅ Restart server and verify in Realtime
4. Set up custom conversions for resume downloads
5. Create weekly traffic review routine
6. Track metrics for recruiter conversations
