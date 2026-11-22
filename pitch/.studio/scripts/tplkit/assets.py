"""Where the skill's data files live (MIT License).

To stay under the skill upload limit, fonts, 3D objects and generator styles ship as one archive,
assets/bundle.tar.xz. The first script that needs them unpacks it into a cache folder
(PPS_CACHE or ~/.cache/pro-pptx-studio); a folder that already has assets/fonts is used as is.
Every entry is checked before extraction: only regular files and folders, and nothing that would
land outside the cache folder.
"""
import os, tarfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(os.path.dirname(HERE))


def _checked_members(z, dest):
    root = os.path.realpath(dest)
    out = []
    for m in z.getmembers():
        if not (m.isfile() or m.isdir()):
            raise RuntimeError('bundle.tar.xz: unexpected entry type: %s' % m.name)
        target = os.path.realpath(os.path.join(root, m.name))
        if target != root and not target.startswith(root + os.sep):
            raise RuntimeError('bundle.tar.xz: entry outside the cache folder: %s' % m.name)
        out.append(m)
    return out


def data_root():
    if os.path.isdir(os.path.join(SKILL, 'assets', 'fonts')):
        return SKILL
    bundle = os.path.join(SKILL, 'assets', 'bundle.tar.xz')
    cache = os.environ.get('PPS_CACHE') or os.path.join(os.path.expanduser('~'), '.cache', 'pro-pptx-studio')
    if not os.path.exists(bundle):
        return SKILL
    stamp = os.path.join(cache, '.unpacked-%d' % os.path.getsize(bundle))
    if not os.path.exists(stamp):
        os.makedirs(cache, exist_ok=True)
        with tarfile.open(bundle, 'r:xz') as z:
            members = _checked_members(z, cache)
            if hasattr(tarfile, 'data_filter'):      # Python 3.12+ (and patched 3.8-3.11)
                z.extractall(cache, members=members, filter='data')
            else:
                z.extractall(cache, members=members)
        open(stamp, 'w').write('ok')
    return cache


def fonts_dir():
    return os.path.join(data_root(), 'assets', 'fonts')


if __name__ == '__main__':
    print(data_root())
