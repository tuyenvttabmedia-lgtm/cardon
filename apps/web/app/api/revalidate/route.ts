import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

type RevalidateBody = {
  secret?: string;
  paths?: string[];
  tags?: string[];
};

function authorized(req: NextRequest, bodySecret?: string): boolean {
  const expected = process.env.WEB_REVALIDATE_SECRET?.trim();
  if (!expected) return false;
  const header = req.headers.get('x-revalidate-secret')?.trim();
  const candidate = header || bodySecret?.trim();
  return Boolean(candidate && candidate === expected);
}

export async function POST(req: NextRequest) {
  let body: RevalidateBody = {};
  try {
    body = (await req.json()) as RevalidateBody;
  } catch {
    body = {};
  }

  if (!authorized(req, body.secret)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const tags = Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : ['cms'];
  for (const tag of tags) {
    if (typeof tag === 'string' && tag.trim()) {
      revalidateTag(tag.trim());
    }
  }

  const paths = Array.isArray(body.paths) ? body.paths : [];
  const revalidatedPaths: string[] = [];
  for (const path of paths) {
    if (typeof path !== 'string' || !path.startsWith('/')) continue;
    revalidatePath(path);
    revalidatedPaths.push(path);
  }

  // Always refresh sitemap when CMS content changes.
  if (!revalidatedPaths.includes('/sitemap.xml')) {
    revalidatePath('/sitemap.xml');
    revalidatedPaths.push('/sitemap.xml');
  }

  return NextResponse.json({
    ok: true,
    revalidated: { tags, paths: revalidatedPaths },
    now: Date.now(),
  });
}
