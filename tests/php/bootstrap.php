<?php

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

/**
 * WordPress-in tərcümə funksiyaları üçün minimal polyfill.
 *
 * Validator sinifləri WordPress-dən asılı DEYİL, lakin istifadəçiyə göstərilən
 * mesajları tərcümə edir. Vahid testlər WordPress yükləmədiyi üçün bu funksiyalar
 * burada mövcud olmalıdır. İnteqrasiya testlərində WordPress-in öz versiyaları işləyir.
 */
if ( ! function_exists( '__' ) ) {
	function __( string $text, string $domain = 'default' ): string { // phpcs:ignore
		unset( $domain );

		return $text;
	}
}

if ( ! function_exists( 'esc_html__' ) ) {
	function esc_html__( string $text, string $domain = 'default' ): string { // phpcs:ignore
		unset( $domain );

		return $text;
	}
}

if ( ! function_exists( 'wp_parse_url' ) ) {
	function wp_parse_url( string $url, int $component = -1 ) { // phpcs:ignore
		return parse_url( $url, $component ); // phpcs:ignore WordPress.WP.AlternativeFunctions.parse_url_parse_url
	}
}
