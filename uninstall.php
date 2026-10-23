<?php
/**
 * Plugin silinərkən işə düşən təmizlik.
 *
 * @package Quoteform
 */

declare(strict_types=1);

// Yalnız WordPress-in öz uninstall axını (Plugins → Delete) bu faylı icra edə bilər.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/*
 * Bu fayl plugin YÜKLƏNMƏDƏN qaçır, `vendor/` isə `.gitignore`-dadır — yəni
 * Composer autoloader-inə bel bağlamaq olmaz. Ona görə Uninstaller-in
 * istifadə etdiyi siniflər birbaşa qoşulur. CPT adı, meta açarı və capability
 * adları literal kimi kopyalanmır: öz siniflərindən oxunur, beləcə uyğunsuzluq
 * yarana bilmir.
 */
require_once __DIR__ . '/includes/Support/Capabilities.php';
require_once __DIR__ . '/includes/Forms/FormPostType.php';
require_once __DIR__ . '/includes/Entries/EntriesTable.php';
require_once __DIR__ . '/includes/Entries/EntryPreferences.php';
require_once __DIR__ . '/includes/Support/Uninstaller.php';

Quoteform\Support\Uninstaller::run();
