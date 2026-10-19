.PHONY: up down setup site logs shell test test74 js e2e buildcheck check clean isetup itest itest-trash-disabled makepot

# WordPress mühitini qaldırır (http://localhost:8083)
up:
	docker compose up -d db wp

down:
	docker compose down

# Təmiz WordPress qurur və plugini aktivləşdirir. `up`-dan sonra bir dəfə qaçırılır.
setup:
	docker compose run --rm cli core install \
	  --url=http://localhost:8083 --title="Quoteform Dev" \
	  --admin_user=admin --admin_password=admin \
	  --admin_email=dev@example.test --skip-email
	docker compose run --rm cli plugin activate quoteform
	@echo "Hazırdır: http://localhost:8083/wp-admin (admin / admin)"

# İxtiyari wp-cli əmri: make site ARGS="plugin list"
site:
	docker compose run --rm cli $(ARGS)

logs:
	docker compose logs -f wp

shell:
	docker compose exec wp bash

# Vahid testlər WordPress TƏLƏB ETMİR — mühərrik çərçivədən asılı deyil.
# Bunlar birdəfəlik PHP konteynerlərində qaçır, compose stack-ə ehtiyac yoxdur.
test:
	./bin/phpunit $(ARGS)

test74:
	QF_PHP=php:7.4-cli ./bin/phpunit $(ARGS)

# WordPress test kitabxanasını quraşdırır (bir dəfə, `make up`-dan sonra)
isetup:
	docker compose run --rm php bash bin/install-wp-tests.sh wordpress_test root root db latest

# İnteqrasiya testləri — WordPress TƏLƏB EDİR
itest:
	docker compose run --rm php vendor/bin/phpunit -c phpunit-integration.xml $(ARGS)

# EMPTY_TRASH_DAYS=0 (Trash söndürülüb) ssenarisi üçün ayrıca dəst — bax
# tests/integration-trash-disabled/bootstrap.php. Ayrı olmasının səbəbi:
# bu sabit WordPress yükləndikdən sonra prosesdaxili dəyişdirilə bilmir,
# ona görə adi itest ilə eyni prosesdə qaçırıla bilmir.
itest-trash-disabled:
	docker compose run --rm php vendor/bin/phpunit -c phpunit-integration-trash-disabled.xml $(ARGS)

js:
	npm test

# Uçdan-uca testlər — WordPress stack-i qalxmış olmalıdır (`make up`) və
# bundle qurulmuş olmalıdır. Ona görə `check`-ə DAXİL EDİLMİR: brauzer
# yükləməsi tələb edir və digər dörd dəstdən xeyli yavaşdır.
e2e:
	npm run build
	npx playwright test

# `build/` repoda saxlanıldığı üçün (spec §20) mənbə ilə uyğunluğu yoxlanılır.
# Köhnəlmişsə DÜŞÜR — özü yenidən qurmur, yoxsa nasazlığı gizlətmiş olardı.
buildcheck:
	./bin/check-build.sh

# Altı qaçış — commit-dən əvvəl bunu işlət
check: buildcheck test test74 js itest itest-trash-disabled

# Tərcümə şablonu: `languages/quoteform.pot`. Həm `includes/` PHP, həm
# `admin-src/` JS sətirlərini bir fayla yığır. Buraxılış addımıdır — `e2e` kimi
# `check`-ə DAXİL EDİLMİR, çünki konteyner tələb edir və hər qaçışda
# POT-Creation-Date-ı dəyişdiyi üçün diff yaradır.
makepot:
	docker compose run --rm cli i18n make-pot \
	  /var/www/html/wp-content/plugins/quoteform \
	  /var/www/html/wp-content/plugins/quoteform/languages/quoteform.pot \
	  --domain=quoteform --slug=quoteform \
	  --exclude=node_modules,vendor,tests,build,.superpowers
	@echo "Hazırdır: languages/quoteform.pot"

# Konteynerləri VƏ volume-ları silir (DB məlumatı itir)
clean:
	docker compose down -v
