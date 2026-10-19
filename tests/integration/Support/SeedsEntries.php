<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration\Support;

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryRepository;

/**
 * `EntryRepository::insert()` vaxtı (`gmdate`) və total-ı (float → `%.4F`) özü
 * hesablayır. Testlərə isə dəqiq `created_at`, float-dan KEÇMƏYƏN onluq total
 * (18 rəqəmli dəyərlər double-da itir) və `read_at` lazımdır — ona görə əvvəl
 * insert(), sonra həmin sütunlar birbaşa yazılır.
 */
trait SeedsEntries
{
    /**
     * @param array<string, mixed> $overrides insert() açarları, üstəgəl `created_at`,
     *        `read_at` (string|null) və `total_decimal` (string|null — `total` sütununa olduğu kimi).
     */
    private function seedEntry( array $overrides = [] ): int
    {
        global $wpdb;

        $columns = [];

        foreach ( [ 'created_at', 'read_at' ] as $column ) {
            if ( array_key_exists( $column, $overrides ) ) {
                $columns[ $column ] = $overrides[ $column ];
                unset( $overrides[ $column ] );
            }
        }

        if ( array_key_exists( 'total_decimal', $overrides ) ) {
            $columns['total'] = $overrides['total_decimal'];
            unset( $overrides['total_decimal'] );
        }

        $id = ( new EntryRepository() )->insert( array_merge( self::entryDefaults(), $overrides ) );

        if ( $id < 1 ) {
            throw new \RuntimeException( 'seedEntry: insert failed: ' . $wpdb->last_error );
        }

        if ( [] !== $columns ) {
            // `null` dəyəri `$wpdb->update()` NULL kimi yazır (WP 4.4+).
            $wpdb->update( EntriesTable::name(), $columns, [ 'id' => $id ] );
        }

        return $id;
    }

    /**
     * @return array<string, mixed>
     */
    private static function entryDefaults(): array
    {
        return [
            'form_id'    => 1,
            'status'     => 'completed',
            'total'      => 100.0,
            'currency'   => 'USD',
            'data'       => [
                'name'  => [ 'label' => 'Your name', 'type' => 'text', 'value' => 'Jane Doe' ],
                'email' => [ 'label' => 'Email', 'type' => 'email', 'value' => 'jane@example.com' ],
            ],
            'breakdown'  => [
                'currency' => 'USD',
                'position' => 'before',
                'decimals' => 2,
                'lines'    => [ [ 'key' => 'total', 'label' => 'Total', 'amount' => 100.0 ] ],
                'error'    => null,
            ],
            'user_id'    => null,
            'ip'         => null,
            'user_agent' => 'Agent',
        ];
    }
}
