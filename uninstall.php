<?php
/**
 * Plugin silinərkən işə düşən təmizlik.
 *
 * @package Quoteform
 */

declare(strict_types=1);

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	return;
}

/*
 * Bu fayl plugin YÜKLƏNMƏDƏN qaçır, `vendor/` isə `.gitignore`-dadır — yəni
 * Composer autoloader-inin mövcudluğuna bel bağlamaq olmaz. Ona görə
 * composer.json-dakı yeganə PSR-4 qaydası (`Quoteform\` => `includes/`)
 * burada təkrarlanır. CPT adı, meta açarı və capability adları literal kimi
 * kopyalanmır: öz siniflərindən oxunur, beləcə uyğunsuzluq yarana bilmir.
 */
spl_autoload_register(
	static function ( string $class ): void {
		$prefix = 'Quoteform\\';

		if ( 0 !== strpos( $class, $prefix ) ) {
			return;
		}

		$path = __DIR__ . '/includes/' . str_replace( '\\', '/', substr( $class, strlen( $prefix ) ) ) . '.php';

		if ( is_readable( $path ) ) {
			require_once $path;
		}
	}
);

Quoteform\Support\Uninstaller::run();
