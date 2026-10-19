<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Admin\EntriesExport;
use Quoteform\Entries\CsvExporter;
use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryQuery;
use Quoteform\Entries\EntryRepository;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Support\Capabilities;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;

final class CsvExportTest extends WP_UnitTestCase
{
    use SeedsEntries;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
        Capabilities::grantToAdministrator();
        update_option( 'timezone_string', 'Asia/Baku' );
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    /**
     * @param array<string, mixed> $params
     */
    private function export( array $params, int $batchSize = 500 ): string
    {
        $out = fopen( 'php://memory', 'w+' );
        ( new CsvExporter( null, null, null, $batchSize ) )->write( EntryQuery::forSite( $params ), $out );
        rewind( $out );
        $csv = (string) stream_get_contents( $out );
        fclose( $out );

        return $csv;
    }

    /**
     * @return array<int, array<int, string>>
     */
    private function parsed( string $csv ): array
    {
        $in = fopen( 'php://memory', 'w+' );
        fwrite( $in, substr( $csv, 3 ) ); // BOM
        rewind( $in );
        $rows = [];

        while ( false !== ( $row = fgetcsv( $in, 0, ',', '"', '' ) ) ) {
            $rows[] = $row;
        }

        fclose( $in );

        return $rows;
    }

    private function formWithFields(): int
    {
        $id = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Cleaning' ] );

        ( new SchemaRepository() )->save(
            $id,
            [
                'version'       => 1,
                'settings'      => [ 'currency' => 'USD', 'currency_position' => 'before', 'decimals' => 2, 'submit_label' => 'Go', 'success_action' => 'message', 'success_message' => 'Thanks', 'redirect_url' => '', 'save_resume' => false, 'store_ip' => false ],
                'fields'        => [
                    'rooms'  => [ 'key' => 'rooms', 'type' => 'number', 'label' => 'Rooms', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => 1 ],
                    'intro'  => [ 'key' => 'intro', 'type' => 'html', 'label' => '', 'help' => '', 'placeholder' => '', 'required' => false, 'default' => '', 'content' => '<p>Hi</p>' ],
                    'name'   => [ 'key' => 'name', 'type' => 'text', 'label' => 'Your name', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => '' ],
                    'extras' => [ 'key' => 'extras', 'type' => 'checkbox', 'label' => 'Extras', 'help' => '', 'placeholder' => '', 'required' => false, 'default' => [], 'options' => [ [ 'label' => 'Oven', 'value' => 'oven', 'price' => 10 ] ] ],
                    'phone'  => [ 'key' => 'phone', 'type' => 'tel', 'label' => 'Phone', 'help' => '', 'placeholder' => '', 'required' => false, 'default' => '' ],
                ],
                'steps'         => [
                    [ 'key' => 'one', 'title' => 'One', 'description' => '', 'fields' => [ 'intro', 'name', 'rooms' ] ],
                    [ 'key' => 'two', 'title' => 'Two', 'description' => '', 'fields' => [ 'extras', 'phone' ] ],
                ],
                'calculations'  => [
                    [ 'key' => 'base', 'label' => 'Rooms cost', 'expression' => '{rooms} * 40', 'visible' => true ],
                    [ 'key' => 'secret', 'label' => 'Margin', 'expression' => '{base} * 0.2', 'visible' => false ],
                ],
                'rules'         => [],
                'notifications' => [],
            ]
        );

        return $id;
    }

    public function testTheFileStartsWithAByteOrderMark(): void
    {
        $this->assertSame( "\xEF\xBB\xBF", substr( $this->export( [] ), 0, 3 ) );
    }

    public function testAllFormsPutEveryAnswerInOneColumn(): void
    {
        $formId = $this->formWithFields();
        $mine   = $this->seedEntry( [ 'form_id' => $formId, 'created_at' => '2026-09-24 21:30:00', 'total_decimal' => '180.0000' ] );
        $orphan = $this->seedEntry( [ 'form_id' => 999999, 'created_at' => '2026-09-23 10:00:00', 'read_at' => '2026-09-23 11:00:00' ] );

        $rows = $this->parsed( $this->export( [] ) );

        $this->assertSame( [ 'ID', 'Date', 'Status', 'Total', 'Currency', 'Form', 'Answers' ], $rows[0] );
        $this->assertSame( [ (string) $mine, '2026-09-25 01:30:00', 'New', '180.0000', 'USD', 'Cleaning', 'Your name: Jane Doe; Email: jane@example.com' ], $rows[1] );
        $this->assertSame( [ (string) $orphan, 'Read', '(deleted form)' ], [ $rows[2][0], $rows[2][2], $rows[2][5] ] );
    }

    public function testOneFormGetsAColumnPerCurrentFieldAndVisibleCalculation(): void
    {
        $formId = $this->formWithFields();
        $this->seedEntry( [
            'form_id'   => $formId,
            'data'      => [
                'name'    => [ 'label' => 'Name (old label)', 'type' => 'text', 'value' => 'Leyla' ],
                'rooms'   => [ 'label' => 'Rooms', 'type' => 'number', 'value' => 3.0 ],
                'extras'  => [ 'label' => 'Extras', 'type' => 'checkbox', 'value' => [ 'oven' ], 'display' => [ 'Oven' ] ],
                'removed' => [ 'label' => 'Gone field', 'type' => 'text', 'value' => 'not exported' ],
            ],
            'breakdown' => [ 'currency' => 'USD', 'position' => 'before', 'decimals' => 2, 'lines' => [ [ 'key' => 'base', 'label' => 'Rooms cost', 'amount' => -12.5 ] ], 'error' => null ],
        ] );

        $rows = $this->parsed( $this->export( [ 'form' => (string) $formId ] ) );

        $this->assertSame( [ 'ID', 'Date', 'Status', 'Total', 'Currency', 'Your name', 'Rooms', 'Extras', 'Phone', 'Rooms cost' ], $rows[0] );
        $this->assertSame( [ 'Leyla', '3', 'Oven', '', '-12.5' ], array_slice( $rows[1], 5 ) );
    }

    public function testTheListsFiltersAndOrderApply(): void
    {
        $old  = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $new  = $this->seedEntry( [ 'created_at' => '2026-09-22 10:00:00' ] );
        $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00', 'read_at' => '2026-09-21 11:00:00' ] );

        $rows = $this->parsed( $this->export( [ 'status' => 'new', 'order' => 'asc' ] ) );

        $this->assertSame( [ (string) $old, (string) $new ], [ $rows[1][0], $rows[2][0] ] );
        $this->assertCount( 3, $rows );
    }

    public function testSmallBatchesStillWriteEveryRowOnceInListOrder(): void
    {
        foreach ( [ '20', '22', '21', '22', '19', '23', '20' ] as $day ) {
            $this->seedEntry( [ 'created_at' => "2026-09-{$day} 08:00:00" ] );
        }

        $rows     = $this->parsed( $this->export( [], 3 ) );
        $expected = array_map( 'strval', array_column( ( new EntryRepository() )->page( EntryQuery::forSite( [] ), 1, 20 )['items'], 'id' ) );

        $this->assertSame( $expected, array_column( array_slice( $rows, 1 ), 0 ) );
    }

    public function testDangerousAndUnusualTextIsSafeAndIntact(): void
    {
        $formId = $this->formWithFields();
        $this->seedEntry( [
            'form_id'       => $formId,
            'total_decimal' => '-25.5000',
            'data'          => [
                'name'  => [ 'label' => 'Your name', 'type' => 'text', 'value' => "\x00=HYPERLINK(\"http://x\")" ],
                'phone' => [ 'label' => 'Phone', 'type' => 'tel', 'value' => "Zəhra ✓\nC:\\\"x\"" ],
            ],
        ] );

        $row = $this->parsed( $this->export( [ 'form' => (string) $formId ] ) )[1];

        $this->assertSame( '-25.5000', $row[3], 'a discount stays a number' );
        $this->assertSame( "'=HYPERLINK(\"http://x\")", $row[5], 'a hidden NUL does not smuggle the formula past the guard' );
        $this->assertSame( "Zəhra ✓\nC:\\\"x\"", $row[8], 'multibyte text, line breaks and a backslash-quote survive' );
    }

    public function testAnExportNeedsTheExportCapability(): void
    {
        wp_set_current_user( self::factory()->user->create( [ 'role' => 'editor' ] ) );

        $this->expectException( 'WPDieException' );
        EntriesExport::authorize( [ '_wpnonce' => wp_create_nonce( EntriesExport::ACTION ) ] );
    }

    public function testAnExportNeedsAFreshNonce(): void
    {
        wp_set_current_user( self::factory()->user->create( [ 'role' => 'administrator' ] ) );

        $this->expectException( 'WPDieException' );
        EntriesExport::authorize( [ '_wpnonce' => 'stale' ] );
    }

    public function testAnAdministratorWithAFreshNonceMayExport(): void
    {
        wp_set_current_user( self::factory()->user->create( [ 'role' => 'administrator' ] ) );

        EntriesExport::authorize( [ '_wpnonce' => wp_create_nonce( EntriesExport::ACTION ) ] );

        $this->addToAssertionCount( 1 );
    }

    public function testTheExportUrlIsARawUrlCarryingItsNonce(): void
    {
        wp_set_current_user( self::factory()->user->create( [ 'role' => 'administrator' ] ) );

        $url = EntriesExport::url();

        $this->assertStringContainsString( 'admin-post.php?action=qform_export_entries&_wpnonce=', $url );
        $this->assertStringNotContainsString( '&amp;', $url );
    }

    public function testTheFileIsNamedForTheSitesDate(): void
    {
        $this->assertSame( 'quoteform-entries-' . wp_date( 'Y-m-d' ) . '.csv', EntriesExport::filename() );
    }

    public function testTheHandlerIsHookedToAdminPost(): void
    {
        $this->assertSame( 10, has_action( 'admin_post_qform_export_entries', [ EntriesExport::class, 'handle' ] ) );
    }
}
