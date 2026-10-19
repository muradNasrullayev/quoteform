#!/usr/bin/env bash
# WordPress core + test kitabxanasını `php` konteynerindəki /wp altına quraşdırır.
# Bir dəfə qaçırılır: make isetup
set -euo pipefail

DB_NAME="${1:-wordpress_test}"
DB_USER="${2:-root}"
DB_PASS="${3:-root}"
DB_HOST="${4:-db}"
WP_VERSION="${5:-latest}"

WP_CORE_DIR="${WP_CORE_DIR:-/wp/wordpress}"
WP_TESTS_DIR="${WP_TESTS_DIR:-/wp/wordpress-tests-lib}"

if [ "$WP_VERSION" = "latest" ]; then
	WP_VERSION=$(curl -s https://api.wordpress.org/core/version-check/1.7/ \
		| grep -o '"version":"[^"]*"' | head -1 | sed -n 's/.*"\([^"]*\)"$/\1/p')
fi
echo "WordPress $WP_VERSION"

# WP_VERSION-un plausible bir versiya olduğunu yoxlayırıq: "latest" wp.org-un
# JSON cavabındakı SIRALAMAYA etibar edir (ilk "version" occurrence-in ən yenisi
# olduğu qarantiya edilmir), açıq ötürülmüş arqument isə səhv yazıla bilər.
# Hər iki halda köhnə/səhv versiya (məs. 4.7.35) səssizcə seçilməməlidir —
# plaginin elan edilmiş minimum WordPress versiyası 6.0-dır.
if ! [[ "$WP_VERSION" =~ ^([0-9]+)\.[0-9]+(\.[0-9]+)?$ ]] || [ "${BASH_REMATCH[1]}" -lt 6 ]; then
	echo "Yanlış və ya çox köhnə WordPress versiyası: '$WP_VERSION' (minimum: 6.0)" >&2
	exit 1
fi

if [ ! -d "$WP_CORE_DIR" ]; then
	mkdir -p "$WP_CORE_DIR"
	curl -sL "https://wordpress.org/wordpress-${WP_VERSION}.tar.gz" \
		| tar --strip-components=1 -zxf - -C "$WP_CORE_DIR"
fi

if [ ! -d "$WP_TESTS_DIR" ]; then
	mkdir -p "$WP_TESTS_DIR"
	svn co --quiet "https://develop.svn.wordpress.org/tags/${WP_VERSION}/tests/phpunit/includes/" \
		"$WP_TESTS_DIR/includes"
	svn co --quiet "https://develop.svn.wordpress.org/tags/${WP_VERSION}/tests/phpunit/data/" \
		"$WP_TESTS_DIR/data"
fi

if [ ! -f "$WP_TESTS_DIR/wp-tests-config.php" ]; then
	curl -sL "https://develop.svn.wordpress.org/tags/${WP_VERSION}/wp-tests-config-sample.php" \
		-o "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s:dirname( __FILE__ ) . '/src/':'${WP_CORE_DIR}/':" "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s/youremptytestdbnamehere/${DB_NAME}/" "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s/yourusernamehere/${DB_USER}/"        "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s/yourpasswordhere/${DB_PASS}/"        "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s|localhost|${DB_HOST}|"               "$WP_TESTS_DIR/wp-tests-config.php"
fi

# Bazanı yaratmağa cəhd edirik; artıq mövcuddursa bu, uğursuz olacaq və bu, normaldır.
mysqladmin create "$DB_NAME" --user="$DB_USER" --password="$DB_PASS" \
	--host="$DB_HOST" --protocol=tcp --skip-ssl >/dev/null 2>&1 || true

# Səbəbdən asılı olmayaraq bazanın HƏQİQƏTƏN əlçatan olduğunu yoxlayırıq.
# Bu, müsbət yoxlamadır: xəta mətnini oxumur, ona görə MySQL/MariaDB fərqlərindən asılı deyil.
QF_DB_CHECK_ERR=$(mktemp)
if ! mysql --user="$DB_USER" --password="$DB_PASS" --host="$DB_HOST" \
	--protocol=tcp --skip-ssl -e "USE \`$DB_NAME\`;" 2>"$QF_DB_CHECK_ERR"; then
	echo "Test bazasına çatmaq mümkün olmadı: $DB_NAME" >&2
	cat "$QF_DB_CHECK_ERR" >&2
	rm -f "$QF_DB_CHECK_ERR"
	exit 1
fi
rm -f "$QF_DB_CHECK_ERR"

echo "Hazırdır. İnteqrasiya testləri: make itest"
