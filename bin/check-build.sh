#!/usr/bin/env bash
#
# `build/` repoya daxildir (spec §20: wp.org build pipeline qaçırmır), yəni
# wp.org-a məhz o qovluq gedir. Bu yoxlama mənbəni AYRI bir qovluğa qurur və
# diskdəki `build/` ilə tutuşdurur: fərq varsa DÜŞÜR, səssizcə yenidən
# qurmur — əks halda `make check` nasazlığı özü gizlədərdi.

set -euo pipefail

cd "$( dirname "$0" )/.."

if [ ! -d build ]; then
	echo "build/ does not exist. Run 'npm run build'." >&2
	exit 1
fi

scratch="$( mktemp -d )"
trap 'rm -rf "$scratch"' EXIT

npx wp-scripts build index=./admin-src/index.js block=./admin-src/block/index.js frontend=./frontend-src/index.js entries=./admin-src/entries.js --output-path="$scratch" > "$scratch.log" 2>&1 || {
	echo "The build itself failed:" >&2
	cat "$scratch.log" >&2
	rm -f "$scratch.log"
	exit 1
}

rm -f "$scratch.log"

# macOS Finder `build/` içinə `.DS_Store` sala bilər. O, mənbədən qurulan
# qovluqda olmur, yəni `make check` nasazlıq OLMAYAN bir şeyə görə qırmızı
# olardı.
differences="$( diff -r -q -x .DS_Store build "$scratch" || true )"

if [ -n "$differences" ]; then
	# `Only in build:` sətirləri AYRICA izah edilir. Bu nasazlıq bu layihədə
	# bir dəfə səhv oxunub: fayl sinxronlaşdırma aləti `build/` içinə
	# `frontend 2.js` kimi nüsxə qoymuşdu, yoxlama onu TUTMUŞDU, günah isə
	# yoxlamada bilinmişdi. `build/` wp.org-a olduğu kimi gedir, yəni belə
	# fayl hər istifadəçiyə çatır — susdurmaq yox, silmək lazımdır.
	strays="$( printf '%s\n' "$differences" | grep '^Only in build' || true )"

	{
		echo "build/ is not what admin-src/ and frontend-src/ compile to right now:"
		echo
		printf '%s\n' "$differences"
		echo

		if [ -n "$strays" ]; then
			echo "The 'Only in build' lines above are files the build does not produce."
			echo "build/ ships to wp.org exactly as it is on disk, so each of them would"
			echo "be published to every user. A name like 'frontend 2.js' is a copy left"
			echo "behind by a file-sync tool (iCloud Drive, Dropbox, Google Drive) — the"
			echo "fix is to delete the copy, not to change the build."
			echo
		fi

		echo "Any other difference means build/ is stale: run 'npm run build' and keep"
		echo "build/ together with the source it was built from."
	} >&2

	exit 1
fi

# `eval()` və `Function()` bu layihədə HEÇ BİR YERDƏ işlədilmir (spec §7.2,
# §15) və bu, istifadəçiyə `readme.txt`-də iki dəfə vəd edilir. Mənbədə belə bir
# çağırış olmaması azdır: `build/` wp.org-a gedən faylların ÖZÜDÜR, ora isə
# asılılıq, loader dəyişikliyi və ya səhvən commit edilmiş dev-build
# (`devtool: 'eval'`) da yazır. Ona görə yoxlama mənbəyə yox, məhz qurulmuş
# bundle-a baxır.
#
# Şablon TƏKDİR və hər iki adı eyni qaydaya tabe edir. Səbəbi: `Function(x)`
# `new Function(x)` ilə eyni konstruktoru çağırır — `new` MƏCBURİ deyil, yəni
# ayrıca `new[[:space:]]+Function` alternativi yarısını buraxırdı.
#
# Sol sərhəd yalnız identifikator hərflərini kəsir (`myeval(`, `fooFunction(`),
# NÖQTƏNİ yox: `window.eval(` və `globalThis.Function(` məhz həmin qlobalların
# özüdür. Minifikasiya buna toxunmur — hər ikisi qlobal addır, minifikator isə
# yalnız lokal adları qısaldır.
#
# Şablonu `tests/php/BuildGuardTest.php` bu sətirdən oxuyur; adını dəyişsən,
# orada da dəyişdir.
forbidden='(^|[^A-Za-z0-9_$])(new[[:space:]]+)?(eval|Function)[[:space:]]*\('

offenders="$( grep -l -E "$forbidden" build/*.js || true )"

if [ -n "$offenders" ]; then
	{
		echo "The built bundle calls eval() or Function(), which this plugin forbids:"
		echo
		# Bundle tək sətirdir (minifikasiya), ona görə sətir yox, YALNIZ uyğun
		# gələn parça göstərilir — əks halda bura bütün faylı tökərdi.
		for file in $offenders; do
			echo "  $file"
			grep -o -E ".{0,40}$forbidden.{0,40}" "$file" \
				| head -3 \
				| sed 's/^/    …/'
		done
	} >&2

	exit 1
fi

echo "build/ matches admin-src/ and frontend-src/, and calls neither eval() nor Function()."
exit 0
