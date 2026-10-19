<?php
/**
 * WordPress inteqrasiya testləri üçün bootstrap.
 *
 * Vahid testlərdən (tests/php/) fərqlidir: bu, tam WordPress yükləyir,
 * ona görə CPT, post meta, capability və REST marşrutları yoxlanıla bilir.
 */

declare(strict_types=1);

$qform_tests_dir = getenv( 'WP_TESTS_DIR' ) ?: '/wp/wordpress-tests-lib';

if ( ! file_exists( $qform_tests_dir . '/includes/functions.php' ) ) {
	echo "wordpress-tests-lib tapılmadı: {$qform_tests_dir}\n";
	echo "Əvvəlcə `make isetup` qaçır.\n";
	exit( 1 );
}

if ( ! defined( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH' ) ) {
	define( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH', dirname( __DIR__, 2 ) . '/vendor/yoast/phpunit-polyfills' );
}

require_once $qform_tests_dir . '/includes/functions.php';

tests_add_filter(
	'muplugins_loaded',
	static function () {
		require dirname( __DIR__, 2 ) . '/quoteform.php';
	}
);

require $qform_tests_dir . '/includes/bootstrap.php';

/*
 * `Plugin::boot()` `EntriesTable::maybeUpgrade()`-i `init`-ə bağlayır (versiya
 * uyğunsuzluğunu aktivasiya hook-u işləmədən düzəltmək üçün). Yuxarıdakı
 * `require` WordPress-i TAM yükləyir və bunun çərçivəsində `init` bir dəfə
 * atəşlənir — HƏLƏ HEÇ BİR test tranzaksiyası açılmayıb, ona görə bu andakı
 * `CREATE TABLE` HƏQIQI (müvəqqəti olmayan) cədvəl yaradır. Hər PHPUnit
 * testinin özü `WP_UnitTestCase::start_transaction()` çağırdıqdan sonra isə
 * `query` filtri `CREATE/DROP TABLE`-i `CREATE/DROP TEMPORARY TABLE`-ə çevirir
 * — testlər YALNIZ müvəqqəti cədvəllər görməlidir, çünki tranzaksiya
 * rollback-i yalnız onları təmizləyə bilir. Bu bloku burada, WordPress
 * yükləndikdən sonra amma hər hansı testin tranzaksiyası başlamazdan ƏVVƏL
 * işlətmək bu həqiqi cədvəli TƏK dəfə, həqiqətən silir (heç bir çevrilmə
 * filtri hələ qeydiyyatda deyil). Bunu `EntriesTable::drop()`-un özündə
 * etmək olmaz: o, hər testin daxilində də çağırılır və orada mütləq
 * tranzaksiya-təhlükəsiz (TEMPORARY-yə çevrilən) qalmalıdır — real
 * `DROP TABLE` MySQL-də implisit COMMIT yaradıb `WP_UnitTestCase`-in
 * hər-test rollback-ini pozardı.
 */
global $wpdb;

$wpdb->query( 'DROP TABLE IF EXISTS ' . \Quoteform\Entries\EntriesTable::name() );
delete_option( \Quoteform\Entries\EntriesTable::OPTION );
