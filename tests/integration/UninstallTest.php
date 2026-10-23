<?php

declare(strict_types=1);

/**
 * `uninstall.php` is a procedural script, not a class, and WordPress runs it
 * in a context this suite cannot reproduce: the plugin is not loaded, no
 * autoloader is registered and `WP_UNINSTALL_PLUGIN` is defined. Three
 * techniques cover it here, each chosen for what it can prove:
 *
 * 1. The work itself lives in `Quoteform\Support\Uninstaller::run()`, which is
 *    an ordinary class and is called directly by the cleanup tests below —
 *    against real WordPress, real roles and the real database.
 * 2. The `WP_UNINSTALL_PLUGIN` guard `exit`s, so it cannot be required in this
 *    process (it would end the suite). It is proved in a bare child process
 *    instead: with the constant undefined the file must stop before loading
 *    any plugin class.
 * 3. The two things (1) and (2) leave uncovered — that `uninstall.php` actually
 *    reaches `Uninstaller::run()`, and that it can load its own classes with no
 *    Composer autoloader anywhere — are proved by running the file in a bare
 *    child PHP process that has neither WordPress nor `vendor/autoload.php`.
 */

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use Quoteform\Support\Uninstaller;
use WP_UnitTestCase;

final class UninstallTest extends WP_UnitTestCase
{
    private const CUSTOM_ROLE = 'qform_uninstall_test_role';

    /** @var string */
    private $uninstallFile;

    protected function setUp(): void
    {
        parent::setUp();

        $this->uninstallFile = dirname( __DIR__, 2 ) . '/uninstall.php';

        FormPostType::register();
    }

    protected function tearDown(): void
    {
        remove_role( self::CUSTOM_ROLE );
        Capabilities::revokeFromAllRoles();

        parent::tearDown();
    }

    public function testTheFileIsInertWhenWordPressDidNotInvokeIt(): void
    {
        $harness = <<<PHP
<?php
register_shutdown_function( static function () {
    echo class_exists( 'Quoteform\\\\Support\\\\Uninstaller', false ) ? "UNINSTALLER_LOADED\\n" : "UNINSTALLER_NOT_LOADED\\n";
} );

require {$this->export( $this->uninstallFile )};

echo "CONTINUED_PAST_GUARD\\n";
PHP;

        $harnessFile = tempnam( sys_get_temp_dir(), 'qform_uninstall_' ) . '.php';
        file_put_contents( $harnessFile, $harness );

        $result = $this->runPhpFile( $harnessFile );

        unlink( $harnessFile );

        $this->assertSame( 0, $result['status'], $result['output'] );
        $this->assertSame( 'UNINSTALLER_NOT_LOADED', $result['output'], 'Without WP_UNINSTALL_PLUGIN the file must exit before loading or running anything.' );
    }

    public function testRunningTheFileDirectlyProducesNothingAndDoesNotFatal(): void
    {
        $result = $this->runPhpFile( $this->uninstallFile );

        $this->assertSame( 0, $result['status'], $result['output'] );
        $this->assertSame( '', $result['output'] );
    }

    public function testTheFileReachesTheUninstallerWithoutAComposerAutoloader(): void
    {
        $harness = <<<PHP
<?php
define( 'WP_UNINSTALL_PLUGIN', 'quoteform/quoteform.php' );

try {
    require {$this->export( $this->uninstallFile )};
} catch ( \Throwable \$e ) {
    echo 'THROWN: ' . \$e->getMessage() . "\\n";
}

echo class_exists( 'Quoteform\\\\Support\\\\Uninstaller' ) ? "UNINSTALLER_OK\\n" : "UNINSTALLER_MISSING\\n";
echo class_exists( 'Quoteform\\\\Support\\\\Capabilities' ) ? "CAPABILITIES_OK\\n" : "CAPABILITIES_MISSING\\n";
echo class_exists( 'Quoteform\\\\Forms\\\\FormPostType' ) ? "FORMPOSTTYPE_OK\\n" : "FORMPOSTTYPE_MISSING\\n";
PHP;

        $harnessFile = tempnam( sys_get_temp_dir(), 'qform_uninstall_' ) . '.php';
        file_put_contents( $harnessFile, $harness );

        $result = $this->runPhpFile( $harnessFile );

        unlink( $harnessFile );

        $this->assertStringContainsString(
            'UNINSTALLER_OK',
            $result['output'],
            'uninstall.php must load its own classes with no Composer autoloader present.'
        );
        $this->assertStringContainsString( 'CAPABILITIES_OK', $result['output'] );
        $this->assertStringContainsString( 'FORMPOSTTYPE_OK', $result['output'] );
        $this->assertStringContainsString(
            'is_multisite',
            $result['output'],
            'With the guard satisfied the file must reach Uninstaller::run(), whose first call is a WordPress function that does not exist in a bare process.'
        );
        $this->assertStringNotContainsString( 'UNINSTALLER_MISSING', $result['output'] );
    }

    public function testRevokesCapabilitiesFromEveryRoleNotOnlyAdministrator(): void
    {
        Activation::activate();

        add_role( self::CUSTOM_ROLE, 'Quoteform uninstall test role' );

        get_role( 'editor' )->add_cap( Capabilities::VIEW_ENTRIES );
        get_role( self::CUSTOM_ROLE )->add_cap( Capabilities::EXPORT_ENTRIES );

        $this->assertTrue( get_role( 'editor' )->has_cap( Capabilities::VIEW_ENTRIES ) );
        $this->assertTrue( get_role( self::CUSTOM_ROLE )->has_cap( Capabilities::EXPORT_ENTRIES ) );

        Uninstaller::run();

        foreach ( [ 'administrator', 'editor', self::CUSTOM_ROLE ] as $slug ) {
            $role = get_role( $slug );

            foreach ( Capabilities::all() as $capability ) {
                $this->assertFalse( $role->has_cap( $capability ), $slug . ' / ' . $capability );
            }
        }
    }

    public function testDeletesEveryFormWhateverItsStatus(): void
    {
        $published = $this->createForm( 'Published' );
        $draft     = $this->createForm( 'Draft', 'draft' );
        $private   = $this->createForm( 'Private', 'private' );
        $trashed   = $this->createForm( 'Trashed' );

        wp_trash_post( $trashed );

        Uninstaller::run();

        foreach ( [ $published, $draft, $private, $trashed ] as $id ) {
            $this->assertNull( get_post( $id ), 'Form ' . $id . ' must be gone.' );
        }

        $this->assertSame( 0, $this->countFormRows() );
    }

    public function testDeletesFormsInMoreThanASingleBatch(): void
    {
        for ( $i = 0; $i < 12; $i++ ) {
            $this->createForm( 'Form ' . $i );
        }

        $this->assertSame( 12, $this->countFormRows() );

        Uninstaller::run();

        $this->assertSame( 0, $this->countFormRows() );
    }

    public function testLeavesPostsOfOtherTypesAlone(): void
    {
        $formId = $this->createForm( 'Goes away' );

        $postId = self::factory()->post->create( [ 'post_title' => 'A normal post' ] );
        $pageId = self::factory()->post->create( [ 'post_type' => 'page', 'post_title' => 'A page' ] );

        update_post_meta( $postId, 'unrelated_meta', 'keep me' );

        Uninstaller::run();

        $this->assertNull( get_post( $formId ) );

        $this->assertInstanceOf( \WP_Post::class, get_post( $postId ), 'A normal post must survive an uninstall.' );
        $this->assertSame( 'publish', get_post_status( $postId ), 'It must not even be trashed.' );
        $this->assertSame( 'keep me', get_post_meta( $postId, 'unrelated_meta', true ) );

        $this->assertInstanceOf( \WP_Post::class, get_post( $pageId ), 'A page must survive an uninstall.' );
    }

    public function testRemovesTheSchemaMetaRowsFromTheDatabase(): void
    {
        $this->createForm( 'With schema' );
        $this->createForm( 'With schema too' );

        $this->assertSame( 2, $this->countSchemaMetaRows() );

        Uninstaller::run();

        $this->assertSame( 0, $this->countSchemaMetaRows(), 'No _qform_schema row may outlive the forms.' );
    }

    public function testRemovesFormRevisionsToo(): void
    {
        $formId = $this->createForm( 'First title' );

        wp_update_post( [ 'ID' => $formId, 'post_title' => 'Second title' ] );

        $this->assertNotEmpty( wp_get_post_revisions( $formId ), 'The fixture needs a revision to be worth anything.' );

        Uninstaller::run();

        global $wpdb;

        $orphans = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_parent = %d",
                $formId
            )
        );

        $this->assertSame( 0, $orphans, 'Revisions of a deleted form must not survive it.' );
    }

    private function createForm( string $title, string $status = 'publish' ): int
    {
        $id = wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => $title,
                'post_status' => $status,
            ]
        );

        update_post_meta( (int) $id, FormPostType::META_SCHEMA, '{"steps":[]}' );

        return (int) $id;
    }

    private function countFormRows(): int
    {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s",
                FormPostType::POST_TYPE
            )
        );
    }

    private function countSchemaMetaRows(): int
    {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = %s",
                FormPostType::META_SCHEMA
            )
        );
    }

    /**
     * @return array{output: string, status: int}
     */
    private function runPhpFile( string $file ): array
    {
        $output = [];
        $status = 0;

        exec( escapeshellarg( PHP_BINARY ) . ' ' . escapeshellarg( $file ) . ' 2>&1', $output, $status );

        return [ 'output' => trim( implode( "\n", $output ) ), 'status' => $status ];
    }

    private function export( string $value ): string
    {
        return var_export( $value, true );
    }
}
