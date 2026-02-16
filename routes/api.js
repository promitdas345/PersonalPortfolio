const fs = require('fs/promises');
const path = require('path');
const { sendJson, sendText, enforceMutationGuards, parseJsonBody, readBodyBuffer, trim, loginKey, isSecureRequest, serializeCookie, createId } = require('../lib/http');
const { hasCapability, userCapabilities } = require('../lib/admin-store');
const { slugify, POST_SORT_FIELDS } = require('../lib/data');
const {
  ADMIN_STATUSES,
  normalizeReactions,
  parsePostPayload,
  deriveExcerpt,
  canEditPost,
  requiredCapabilityForStatus,
  ensureTransition,
} = require('../lib/post-helpers');
const { validateImageFile, generateUploadFilename, ensureUploadDir, parseMultipartBody, MAX_IMAGE_BYTES } = require('../lib/upload-helpers');

function createApiRoutes(deps) {
  const {
    auth,
    loaders,
    transporter,
    resolveEditablePath,
    projectsFile,
    publicDir,
  } = deps;
  const { loadPosts, loadProjects, updatePosts, invalidateAllCaches, markdownToSafeHtml, htmlToBasicMarkdown, escapeHtml, sanitizeUrl, sanitizeRichHtml } = loaders;

  const normalizeProjectLink = value => {
    const normalized = sanitizeUrl(trim(value, 500));
    return normalized === '#' ? '' : normalized;
  };

  const normalizeProjectImage = value => {
    const normalized = sanitizeUrl(trim(value || '/public/images/placeholder.png', 500));
    return normalized === '#' ? '/public/images/placeholder.png' : normalized;
  };

  async function handleApiRoute(req, res, normalizedPathname, method, url) {
    const adminPostMatch = normalizedPathname.match(/^\/api\/admin\/posts\/([^/]+)$/);
    const adminProjectMatch = normalizedPathname.match(/^\/api\/admin\/projects\/([^/]+)$/);
    const publicReactionMatch = normalizedPathname.match(/^\/api\/posts\/([^/]+)\/reactions$/);

    if (normalizedPathname === '/api/admin/session' && method === 'GET') {
      return sendJson(res, 200, auth.sessionPayload(await auth.authContext(req)));
    }

    if (normalizedPathname === '/api/admin/login' && method === 'POST') {
      if (!enforceMutationGuards(req, res, null, false)) return;
      try {
        const body = await parseJsonBody(req);
        const login = loginKey(body.username || body.email || body.login);
        const password = String(body.password || '');
        if (!login || !password) return sendJson(res, 400, { success: false, error: 'Username/email and password are required.' });
        const store = await auth.loadStore();
        const ip = auth.getRequestIp(req);
        const userAgent = auth.getRequestUserAgent(req);
        const rateState = auth.evaluateLoginRateLimit(store, login, ip);
        if (rateState.limited) {
          return sendJson(
            res,
            429,
            {
              success: false,
              error: `Too many login attempts. Try again in ${Math.max(1, Math.ceil(rateState.retryAfterMs / 1000))} seconds.`,
            },
            { 'Retry-After': String(Math.max(1, Math.ceil(rateState.retryAfterMs / 1000))) }
          );
        }
        const user = store.users.find(candidate => auth.loginMatchesUser(candidate, login));
        if (!user || user.status !== 'active' || !auth.verifyPassword(password, user.passwordHash)) {
          const failedState = await auth.recordFailedLogin(login, ip);
          if (failedState.limited) {
            return sendJson(
              res,
              429,
              {
                success: false,
                error: `Too many login attempts. Try again in ${Math.max(1, Math.ceil(failedState.retryAfterMs / 1000))} seconds.`,
              },
              { 'Retry-After': String(Math.max(1, Math.ceil(failedState.retryAfterMs / 1000))) }
            );
          }
          return sendJson(res, 401, { success: false, error: 'Invalid username/email or password.' });
        }
        const { token, session } = await auth.createSession(user, req);
        const cookie = serializeCookie(auth.ADMIN_SESSION_COOKIE, token, {
          path: '/',
          maxAge: Math.floor(auth.ADMIN_SESSION_TTL_MS / 1000),
          httpOnly: true,
          sameSite: 'Lax',
          secure: isSecureRequest(req),
        });
        await auth.mutateStore(next => {
          auth.clearLoginFailures(next, login, ip);
          const target = next.users.find(candidate => candidate.id === user.id);
          if (target) {
            target.lastLoginAt = new Date().toISOString();
            target.updatedAt = new Date().toISOString();
          }
          auth.addAudit(next, {
            actorId: user.id,
            action: 'auth.login',
            entityType: 'session',
            entityId: session.id,
            beforeJson: null,
            afterJson: { userId: user.id },
            ip,
            userAgent,
          });
        });
        return sendJson(
          res,
          200,
          {
            success: true,
            ...auth.sessionPayload({
              session: { token, ...session },
              user,
              capabilities: userCapabilities(user),
            }),
          },
          { 'Set-Cookie': cookie }
        );
      } catch (err) {
        return sendJson(res, err.message === 'Payload too large' ? 413 : 400, { success: false, error: err.message });
      }
    }

    if (normalizedPathname === '/api/admin/logout' && method === 'POST') {
      const context = await auth.authContext(req);
      if (context.session && !enforceMutationGuards(req, res, context.session)) return;
      if (context.session) await auth.deleteSession(context.session.token);
      const expiredCookie = serializeCookie(auth.ADMIN_SESSION_COOKIE, '', {
        path: '/',
        maxAge: 0,
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecureRequest(req),
      });
      return sendJson(res, 200, { success: true }, { 'Set-Cookie': expiredCookie });
    }

    if (normalizedPathname === '/api/admin/site-file' && method === 'GET') {
      const context = await auth.requireAuth(req, res);
      if (!context || !auth.requireCapability(context, 'inline.edit', res)) return;
      try {
        const { displayPath, absolutePath } = resolveEditablePath(url.searchParams.get('path'));
        const content = await fs.readFile(absolutePath, 'utf8');
        return sendJson(res, 200, { success: true, path: displayPath, content });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    if (normalizedPathname === '/api/admin/site-file' && method === 'POST') {
      const context = await auth.requireAuth(req, res);
      if (!context || !auth.requireCapability(context, 'inline.edit', res)) return;
      if (!enforceMutationGuards(req, res, context.session)) return;
      try {
        const body = await parseJsonBody(req);
        const { displayPath, absolutePath } = resolveEditablePath(body.path);
        const content = String(body.content || '');
        if (content.length > 2_000_000) throw new Error('Content is too large.');
        const temp = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
        await fs.writeFile(temp, content, 'utf8');
        await fs.rename(temp, absolutePath);
        invalidateAllCaches();
        return sendJson(res, 200, { success: true, path: displayPath });
      } catch (err) {
        return sendJson(res, err.message === 'Payload too large' ? 413 : 400, { success: false, error: err.message });
      }
    }

    if (normalizedPathname === '/api/admin/posts' && method === 'GET') {
      const context = await auth.requireAuth(req, res);
      if (!context || !auth.requireCapability(context, 'content.posts.read', res)) return;
      const q = trim(url.searchParams.get('q') || '', 120);
      const status = String(url.searchParams.get('status') || 'all').toLowerCase();
      const sort = String(url.searchParams.get('sort') || 'updatedAt');
      const order = String(url.searchParams.get('order') || 'desc').toLowerCase();
      let posts = await loadPosts({
        includeUnpublished: true,
        includeArchived: true,
        q,
        status: ADMIN_STATUSES.has(status) ? status : 'all',
        sort: POST_SORT_FIELDS.has(sort) ? sort : 'updatedAt',
        order: order === 'asc' ? 'asc' : 'desc',
      });
      if (!hasCapability(context.capabilities, 'content.posts.edit.any') && hasCapability(context.capabilities, 'content.posts.edit.own')) {
        posts = posts.filter(post => post.authorId === context.user.id);
      }
      return sendJson(res, 200, { success: true, posts });
    }

    if (normalizedPathname === '/api/admin/posts' && method === 'POST') {
      const context = await auth.requireAuth(req, res);
      if (!context || !auth.requireCapability(context, 'content.posts.create', res)) return;
      if (!enforceMutationGuards(req, res, context.session)) return;
      try {
        const payload = parsePostPayload(await parseJsonBody(req), true);
        const nowIso = new Date().toISOString();
        const status = payload.status || 'draft';
        if (status !== 'draft' && !hasCapability(context.capabilities, requiredCapabilityForStatus(status))) {
          throw new Error('You cannot create posts directly in this status.');
        }
        const result = await updatePosts(posts => {
          const existingSlugs = new Set(posts.map(post => post.slug));
          const slug = slugify(payload.slugRaw || payload.title || 'post');
          if (!slug) throw new Error('Slug must contain letters or numbers.');
          if (existingSlugs.has(slug)) throw new Error('Slug already exists.');
          const media = payload.media || [];
          const post = {
            id: createId(),
            authorId: context.user.id,
            lastEditedBy: context.user.id,
            slug,
            title: payload.title,
            excerpt: payload.excerpt || deriveExcerpt(payload.contentMarkdown || htmlToBasicMarkdown(payload.contentHtml)),
            contentMarkdown: payload.contentMarkdown || htmlToBasicMarkdown(payload.contentHtml),
            contentHtml: payload.contentHtml ? sanitizeRichHtml(payload.contentHtml) : markdownToSafeHtml(payload.contentMarkdown),
            status,
            date: payload.date,
            publishedAt: status === 'published' ? nowIso : null,
            scheduledAt: status === 'scheduled' ? payload.scheduledAt || null : null,
            approvedAt: status === 'approved' || status === 'scheduled' || status === 'published' ? nowIso : null,
            createdAt: nowIso,
            updatedAt: nowIso,
            archivedAt: status === 'archived' ? nowIso : null,
            linkedinSourceUrl: payload.linkedinSourceUrl || '',
            hashtags: payload.hashtags || [],
            media,
            coverImage: payload.coverImage || (media[0] ? media[0].url : ''),
            reactions: payload.reactions || { like: 0, celebrate: 0, support: 0, insightful: 0 },
            commentsCount: payload.commentsCount || 0,
            reposts: payload.reposts || 0,
            featured: payload.featured || false,
            visibility: payload.visibility || 'public',
            allowComments: payload.allowComments !== false,
          };
          posts.unshift(post);
          return { result: post };
        });
        await auth.mutateStore(store => {
          auth.addAudit(store, {
            actorId: context.user.id,
            action: 'post.create',
            entityType: 'post',
            entityId: result.result.id,
            beforeJson: null,
            afterJson: result.result,
            ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
            userAgent: String(req.headers['user-agent'] || ''),
          });
          auth.addRevision(store, { entityType: 'post', entityId: result.result.id, snapshotJson: result.result, changedBy: context.user.id });
          auth.addWorkflowEvent(store, {
            entityType: 'post',
            entityId: result.result.id,
            fromStatus: 'new',
            toStatus: status,
            note: 'Post created.',
            changedBy: context.user.id,
          });
        });
        return sendJson(res, 201, { success: true, post: result.result });
      } catch (err) {
        return sendJson(res, err.message === 'Slug already exists.' ? 409 : 400, { success: false, error: err.message });
      }
    }

    if (adminPostMatch && method === 'PATCH') {
      const context = await auth.requireAuth(req, res);
      if (!context) return;
      if (!enforceMutationGuards(req, res, context.session)) return;
      const postId = decodeURIComponent(adminPostMatch[1]);
      try {
        const payload = parsePostPayload(await parseJsonBody(req), false);
        const nowIso = new Date().toISOString();
        const result = await updatePosts(posts => {
          const index = posts.findIndex(post => post.id === postId);
          if (index < 0) throw new Error('Post not found.');
          const current = posts[index];
          if (!canEditPost(context, current)) throw new Error('You cannot edit this post.');
          const nextStatus = payload.status || current.status;
          if (nextStatus !== current.status) {
            ensureTransition(current.status, nextStatus);
            if (!hasCapability(context.capabilities, requiredCapabilityForStatus(nextStatus))) {
              throw new Error('You do not have permission for this workflow transition.');
            }
          }
          if (nextStatus === 'scheduled' && !(payload.scheduledAt || current.scheduledAt)) {
            throw new Error('scheduledAt is required for scheduled posts.');
          }
          const media = payload.media !== undefined ? payload.media : current.media || [];
          const title = payload.title !== undefined ? payload.title : current.title;
          const slug = slugify(payload.slugRaw || current.slug || title);
          if (!slug) throw new Error('Slug must contain letters or numbers.');
          if (posts.some(post => post.id !== postId && post.slug === slug)) throw new Error('Slug already exists.');
          const hasRichHtml = payload.contentHtml !== undefined;
          const contentMarkdown = hasRichHtml
            ? (payload.contentMarkdown || htmlToBasicMarkdown(payload.contentHtml))
            : (payload.contentMarkdown !== undefined ? payload.contentMarkdown : current.contentMarkdown);
          const contentHtml = hasRichHtml
            ? sanitizeRichHtml(payload.contentHtml)
            : (payload.contentMarkdown !== undefined ? markdownToSafeHtml(contentMarkdown) : current.contentHtml);
          if (!String(contentMarkdown || '').trim() && !String(contentHtml || '').trim()) throw new Error('Post content is required.');
          const updated = {
            ...current,
            title,
            slug,
            excerpt: payload.excerpt !== undefined ? payload.excerpt : (hasRichHtml || payload.contentMarkdown !== undefined) ? deriveExcerpt(contentMarkdown) : current.excerpt,
            contentMarkdown,
            contentHtml,
            status: nextStatus,
            date: payload.date || current.date,
            scheduledAt: nextStatus === 'scheduled' ? payload.scheduledAt || current.scheduledAt : null,
            approvedAt: nextStatus === 'approved' || nextStatus === 'scheduled' || nextStatus === 'published' ? current.approvedAt || nowIso : null,
            publishedAt: nextStatus === 'published' ? current.publishedAt || nowIso : nextStatus === 'draft' || nextStatus === 'in_review' || nextStatus === 'archived' ? null : current.publishedAt,
            archivedAt: nextStatus === 'archived' ? nowIso : null,
            updatedAt: nowIso,
            lastEditedBy: context.user.id,
            linkedinSourceUrl: payload.linkedinSourceUrl !== undefined ? payload.linkedinSourceUrl : current.linkedinSourceUrl || '',
            hashtags: payload.hashtags !== undefined ? payload.hashtags : current.hashtags || [],
            media,
            coverImage: payload.coverImage !== undefined ? payload.coverImage : current.coverImage || (media[0] ? media[0].url : ''),
            reactions: payload.reactions !== undefined ? payload.reactions : current.reactions || { like: 0, celebrate: 0, support: 0, insightful: 0 },
            commentsCount: payload.commentsCount !== undefined ? payload.commentsCount : current.commentsCount || 0,
            reposts: payload.reposts !== undefined ? payload.reposts : current.reposts || 0,
            featured: payload.featured !== undefined ? payload.featured : current.featured || false,
            visibility: payload.visibility !== undefined ? payload.visibility : current.visibility || 'public',
            allowComments: payload.allowComments !== undefined ? payload.allowComments : current.allowComments !== false,
          };
          posts[index] = updated;
          return { result: { before: current, after: updated } };
        });
        await auth.mutateStore(store => {
          auth.addAudit(store, {
            actorId: context.user.id,
            action: 'post.update',
            entityType: 'post',
            entityId: postId,
            beforeJson: result.result.before,
            afterJson: result.result.after,
            ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
            userAgent: String(req.headers['user-agent'] || ''),
          });
          auth.addRevision(store, { entityType: 'post', entityId: postId, snapshotJson: result.result.after, changedBy: context.user.id });
        });
        return sendJson(res, 200, { success: true, post: result.result.after });
      } catch (err) {
        const statusCode = err.message === 'Post not found.' ? 404 : err.message === 'Slug already exists.' ? 409 : err.message === 'You cannot edit this post.' ? 403 : 400;
        return sendJson(res, statusCode, { success: false, error: err.message });
      }
    }

    if (adminPostMatch && method === 'DELETE') {
      const context = await auth.requireAuth(req, res);
      if (!context || !auth.requireCapability(context, 'content.posts.archive', res)) return;
      if (!enforceMutationGuards(req, res, context.session)) return;
      const postId = decodeURIComponent(adminPostMatch[1]);
      try {
        const result = await updatePosts(posts => {
          const index = posts.findIndex(post => post.id === postId);
          if (index < 0) throw new Error('Post not found.');
          const post = posts[index];
          if (!canEditPost(context, post)) throw new Error('You cannot delete this post.');
          posts.splice(index, 1);
          return { result: post };
        });
        await auth.mutateStore(store => {
          auth.addAudit(store, {
            actorId: context.user.id,
            action: 'post.delete',
            entityType: 'post',
            entityId: postId,
            beforeJson: result.result,
            afterJson: null,
            ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
            userAgent: String(req.headers['user-agent'] || ''),
          });
        });
        return sendJson(res, 200, { success: true });
      } catch (err) {
        const statusCode = err.message === 'Post not found.' ? 404 : err.message === 'You cannot delete this post.' ? 403 : 400;
        return sendJson(res, statusCode, { success: false, error: err.message });
      }
    }

    if (normalizedPathname === '/api/posts' && method === 'GET') {
      return sendJson(res, 200, await loadPosts());
    }

    if (publicReactionMatch && method === 'POST') {
      if (!enforceMutationGuards(req, res, null, false)) return;
      try {
        const slug = decodeURIComponent(publicReactionMatch[1]);
        const body = await parseJsonBody(req);
        const type = String(body.type || '').trim().toLowerCase();
        if (!['like', 'celebrate', 'support', 'insightful'].includes(type)) throw new Error('Reaction type is invalid.');
        const store = await auth.loadStore();
        if (store.siteSettings && store.siteSettings.blog && store.siteSettings.blog.allowPublicReactions === false) {
          return sendJson(res, 403, { success: false, error: 'Public reactions are disabled.' });
        }
        const result = await updatePosts(posts => {
          const index = posts.findIndex(post => post.slug === slug && post.status === 'published');
          if (index < 0) throw new Error('Post not found.');
          if (posts[index].allowComments === false) throw new Error('Reactions are disabled for this post.');
          const reactions = normalizeReactions(posts[index].reactions);
          reactions[type] += 1;
          posts[index] = { ...posts[index], reactions, updatedAt: new Date().toISOString() };
          return { result: reactions };
        });
        return sendJson(res, 200, { success: true, reactions: result.result });
      } catch (err) {
        const statusCode =
          err.message === 'Post not found.'
            ? 404
            : err.message === 'Reactions are disabled for this post.'
              ? 403
              : 400;
        return sendJson(res, statusCode, { success: false, error: err.message });
      }
    }

    if (normalizedPathname === '/api/projects' && method === 'GET') {
      return sendJson(res, 200, await loadProjects());
    }

    if (normalizedPathname === '/api/admin/projects' && method === 'GET') {
      const context = await auth.requireAuth(req, res);
      if (!context || !auth.requireCapability(context, 'content.projects.read', res)) return;
      const q = trim(url.searchParams.get('q') || '', 120).toLowerCase();
      let projects = await loadProjects();
      if (q) {
        projects = projects.filter(project => `${project.title} ${project.description} ${project.slug}`.toLowerCase().includes(q));
      }
      return sendJson(res, 200, { success: true, projects });
    }

    if (normalizedPathname === '/api/admin/projects' && method === 'POST') {
      const context = await auth.requireAuth(req, res);
      if (!context || !auth.requireCapability(context, 'content.projects.create', res)) return;
      if (!enforceMutationGuards(req, res, context.session)) return;
      try {
        const body = await parseJsonBody(req);
        const title = trim(body.title, 140);
        const description = trim(body.description, 500);
        if (!title) throw new Error('Project title is required.');
        if (!description) throw new Error('Project description is required.');
        const projects = await loadProjects();
        const nextId = projects.length ? Math.max(...projects.map(project => project.id)) + 1 : 1;
        const slug = slugify(body.slug || title);
        if (projects.some(project => project.slug === slug)) throw new Error('A project with this slug already exists.');
        const project = {
          id: nextId,
          slug,
          title,
          description,
          summary: trim(body.summary || description, 500),
          technologies: Array.isArray(body.technologies) ? body.technologies : [],
          link: normalizeProjectLink(body.link),
          image: normalizeProjectImage(body.image),
          impactHeadline: trim(body.impactHeadline, 500),
          highlights: Array.isArray(body.highlights) ? body.highlights : [],
          metrics: Array.isArray(body.metrics) ? body.metrics : [],
          architecture: Array.isArray(body.architecture) ? body.architecture : [],
          ownership: trim(body.ownership, 1000),
          content: sanitizeRichHtml(body.content),
          authorId: context.user.id,
        };
        projects.push(project);
        await fs.writeFile(projectsFile, `${JSON.stringify(projects, null, 2)}\n`, 'utf8');
        invalidateAllCaches();
        return sendJson(res, 201, { success: true, project });
      } catch (err) {
        return sendJson(res, err.message === 'A project with this slug already exists.' ? 409 : 400, { success: false, error: err.message });
      }
    }

    if (adminProjectMatch && method === 'PATCH') {
      const context = await auth.requireAuth(req, res);
      if (!context) return;
      if (!enforceMutationGuards(req, res, context.session)) return;
      const projectId = Number(decodeURIComponent(adminProjectMatch[1]));
      try {
        const body = await parseJsonBody(req);
        const projects = await loadProjects();
        const index = projects.findIndex(project => project.id === projectId);
        if (index < 0) return sendJson(res, 404, { success: false, error: 'Project not found.' });
        const current = projects[index];
        if (!hasCapability(context.capabilities, 'content.projects.edit.any') && current.authorId !== context.user.id) {
          return sendJson(res, 403, { success: false, error: 'You cannot edit this project.' });
        }
        const slug = body.slug ? slugify(body.slug) : current.slug;
        if (slug !== current.slug && projects.some(project => project.slug === slug)) {
          throw new Error('A project with this slug already exists.');
        }
        projects[index] = {
          ...current,
          title: body.title !== undefined ? trim(body.title, 140) : current.title,
          description: body.description !== undefined ? trim(body.description, 500) : current.description,
          slug,
          summary: body.summary !== undefined ? trim(body.summary, 500) : current.summary,
          technologies: Array.isArray(body.technologies) ? body.technologies : current.technologies,
          link: body.link !== undefined ? normalizeProjectLink(body.link) : current.link,
          image: body.image !== undefined ? normalizeProjectImage(body.image) : current.image,
          impactHeadline: body.impactHeadline !== undefined ? trim(body.impactHeadline, 500) : current.impactHeadline,
          highlights: Array.isArray(body.highlights) ? body.highlights : current.highlights,
          metrics: Array.isArray(body.metrics) ? body.metrics : current.metrics,
          architecture: Array.isArray(body.architecture) ? body.architecture : current.architecture,
          ownership: body.ownership !== undefined ? trim(body.ownership, 1000) : current.ownership,
          content: body.content !== undefined ? sanitizeRichHtml(body.content) : current.content,
        };
        await fs.writeFile(projectsFile, `${JSON.stringify(projects, null, 2)}\n`, 'utf8');
        invalidateAllCaches();
        return sendJson(res, 200, { success: true, project: projects[index] });
      } catch (err) {
        return sendJson(res, err.message === 'A project with this slug already exists.' ? 409 : 400, { success: false, error: err.message });
      }
    }

    if (adminProjectMatch && method === 'DELETE') {
      const context = await auth.requireAuth(req, res);
      if (!context || !auth.requireCapability(context, 'content.projects.archive', res)) return;
      if (!enforceMutationGuards(req, res, context.session)) return;
      const projectId = Number(decodeURIComponent(adminProjectMatch[1]));
      const projects = await loadProjects();
      const index = projects.findIndex(project => project.id === projectId);
      if (index < 0) return sendJson(res, 404, { success: false, error: 'Project not found.' });
      projects.splice(index, 1);
      await fs.writeFile(projectsFile, `${JSON.stringify(projects, null, 2)}\n`, 'utf8');
      invalidateAllCaches();
      return sendJson(res, 200, { success: true });
    }

    if (normalizedPathname === '/api/admin/uploads/images' && method === 'POST') {
      const context = await auth.requireAuth(req, res);
      if (!context || !auth.requireCapability(context, 'content.posts.create', res)) return;
      if (!enforceMutationGuards(req, res, context.session)) return;
      try {
        const ct = String(req.headers['content-type'] || '');
        if (!ct.includes('multipart/form-data')) throw new Error('Expected multipart/form-data.');
        const bodyBuffer = await readBodyBuffer(req, MAX_IMAGE_BYTES + 1024);
        const { files } = parseMultipartBody(bodyBuffer, ct);
        if (!files.length) throw new Error('No file uploaded.');
        const file = files[0];
        validateImageFile(file.buffer, file.filename);
        const uploadDir = path.join(publicDir, 'images', 'uploads');
        await ensureUploadDir(uploadDir);
        const filename = generateUploadFilename(file.filename);
        const filePath = path.join(uploadDir, filename);
        await fs.writeFile(filePath, file.buffer);
        const url = `/public/images/uploads/${filename}`;
        return sendJson(res, 201, { success: true, url });
      } catch (err) {
        const code = err.message === 'Payload too large' ? 413 : 400;
        return sendJson(res, code, { success: false, error: err.message });
      }
    }

    if (normalizedPathname === '/api/contact' && method === 'POST') {
      if (!enforceMutationGuards(req, res, null, false)) return;
      try {
        const formData = await parseJsonBody(req);
        const name = trim(formData.name, 100).replace(/[\r\n]/g, '');
        const email = trim(formData.email, 254).replace(/[\r\n]/g, '');
        const message = trim(formData.message, 5000);
        if (!name || !email || !message) {
          return sendJson(res, 400, { success: false, error: 'Name, email, and message are required.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return sendJson(res, 400, { success: false, error: 'Please provide a valid email address.' });
        }
        console.log(`[email] Attempting to send email from ${email} (${name})`);
        await transporter.sendMail({
          from: process.env.EMAIL_USER || 'noreply@example.com',
          replyTo: `"${name}" <${email}>`,
          to: process.env.EMAIL_TO || 'your-email@example.com',
          subject: `New contact from ${name}`,
          text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
          html: `<p>You have a new contact form submission from:</p>
               <ul>
                 <li><strong>Name:</strong> ${escapeHtml(name)}</li>
                 <li><strong>Email:</strong> ${escapeHtml(email)}</li>
               </ul>
               <p><strong>Message:</strong></p>
               <p>${escapeHtml(message)}</p>`,
        });
        console.log(`[email] ✓ Email sent successfully`);
        return sendJson(res, 200, { success: true });
      } catch (err) {
        console.error(`[email] ✗ Failed to send email:`, err.message, err.code || '');
        return sendJson(res, err.message === 'Payload too large' ? 413 : err.message === 'Invalid JSON' ? 400 : 500, {
          success: false,
          error: err.message === 'Invalid JSON' ? err.message : 'Could not send email',
        });
      }
    }

    return false; // not handled
  }

  return handleApiRoute;
}

module.exports = { createApiRoutes };
