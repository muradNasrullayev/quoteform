<?php

declare(strict_types=1);

namespace Quoteform\Entries;

use Quoteform\Forms\CorruptSchemaException;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Runtime\Values;

// phpcs:disable WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- `$out` is the php://output stream of the download response, not a file; WP_Filesystem has no stream API.
/**
 * Müraciətlərin CSV-si (yeni spec §5). Siyahı ilə EYNİ EntryQuery-ni işlədir;
 * paketlər keyset ilə oxunur (OFFSET yox) və dərhal axına yazılır.
 */
final class CsvExporter
{
    private const BOM = "\xEF\xBB\xBF";

    /** @var EntryRepository */
    private $entries;

    /** @var SchemaRepository */
    private $forms;

    /** @var EntryPresenter */
    private $presenter;

    /** @var int */
    private $batchSize;

    public function __construct( ?EntryRepository $entries = null, ?SchemaRepository $forms = null, ?EntryPresenter $presenter = null, int $batchSize = 500 )
    {
        $this->entries   = $entries ?? new EntryRepository();
        $this->forms     = $forms ?? new SchemaRepository();
        $this->presenter = $presenter ?? new EntryPresenter();
        $this->batchSize = max( 1, $batchSize );
    }

    /**
     * @param resource $out
     */
    public function write( EntryQuery $query, $out ): int
    {
        $layout  = $this->layout( $query );
        $written = 0;
        $after   = null;

        fwrite( $out, self::BOM );
        fwrite( $out, CsvCell::line( $layout['header'] ) );

        do {
            $batch  = $this->entries->slice( $query, $after, $this->batchSize );
            $titles = null === $layout['fields'] ? FormDirectory::titles( array_column( $batch, 'form_id' ) ) : [];

            foreach ( $batch as $entry ) {
                fwrite( $out, CsvCell::line( $this->row( $entry, $layout, $titles ) ) );
                $written++;
            }

            $after = [] === $batch ? null : $batch[ count( $batch ) - 1 ];
        } while ( count( $batch ) === $this->batchSize );

        return $written;
    }

    /**
     * @return array{header: string[], fields: string[]|null, calculations: string[]}
     */
    private function layout( EntryQuery $query ): array
    {
        $header = [
            __( 'ID', 'quoteform' ),
            __( 'Date', 'quoteform' ),
            __( 'Status', 'quoteform' ),
            __( 'Total', 'quoteform' ),
            __( 'Currency', 'quoteform' ),
        ];
        $schema = $this->formSchema( $query->formId() );

        if ( null === $schema ) {
            $header[] = __( 'Form', 'quoteform' );
            $header[] = __( 'Answers', 'quoteform' );

            return [ 'header' => $header, 'fields' => null, 'calculations' => [] ];
        }

        $fields = $this->fieldKeys( $schema );

        foreach ( $fields as $key ) {
            $header[] = self::heading( $schema['fields'][ $key ], $key );
        }

        $calculations = [];

        foreach ( is_array( $schema['calculations'] ?? null ) ? $schema['calculations'] : [] as $calculation ) {
            if ( ! is_array( $calculation ) || true !== ( $calculation['visible'] ?? false ) || ! is_string( $calculation['key'] ?? null ) ) {
                continue;
            }

            $calculations[] = $calculation['key'];
            $header[]       = self::heading( $calculation, $calculation['key'] );
        }

        return [ 'header' => $header, 'fields' => $fields, 'calculations' => $calculations ];
    }

    /**
     * Yalnız mövcud (zibildə olmayan) forma üçün; pozulmuş sxem → "All forms" görünüşü.
     *
     * @return array<string, mixed>|null
     */
    private function formSchema( ?int $formId ): ?array
    {
        if ( null === $formId || [] === FormDirectory::titles( [ $formId ] ) ) {
            return null;
        }

        try {
            $schema = $this->forms->find( $formId );
        } catch ( CorruptSchemaException $error ) {
            return null;
        }

        return $schema ?? SchemaRepository::defaults();
    }

    /**
     * @param array<string, mixed> $schema
     * @return string[] addım sırası ilə, `html` sahələri xaric
     */
    private function fieldKeys( array $schema ): array
    {
        $fields = is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
        $keys   = [];

        foreach ( is_array( $schema['steps'] ?? null ) ? $schema['steps'] : [] as $step ) {
            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $key ) {
                $key = (string) $key;

                if ( is_array( $fields[ $key ] ?? null ) && 'html' !== ( $fields[ $key ]['type'] ?? '' ) && ! in_array( $key, $keys, true ) ) {
                    $keys[] = $key;
                }
            }
        }

        return $keys;
    }

    /**
     * @param array<string, mixed>                                                  $entry
     * @param array{header: string[], fields: string[]|null, calculations: string[]} $layout
     * @param array<int, string>                                                    $titles
     * @return string[]
     */
    private function row( array $entry, array $layout, array $titles ): array
    {
        $row = [
            (string) $entry['id'],
            $this->presenter->csvDate( (string) $entry['created_at'] ),
            null === $entry['read_at'] ? __( 'New', 'quoteform' ) : __( 'Read', 'quoteform' ),
            (string) ( $entry['total_decimal'] ?? '' ),
            (string) $entry['currency'],
        ];
        $answers = $this->presenter->answers( $entry );

        if ( null === $layout['fields'] ) {
            $parts = [];

            foreach ( $answers as $answer ) {
                if ( '' !== $answer['display'] ) {
                    $parts[] = ( '' !== $answer['label'] ? $answer['label'] : $answer['key'] ) . ': ' . $answer['display'];
                }
            }

            $row[] = $this->presenter->formTitle( (int) $entry['form_id'], $titles ) ?? __( '(deleted form)', 'quoteform' );
            $row[] = implode( '; ', $parts );

            return $row;
        }

        $byKey = [];

        foreach ( $answers as $answer ) {
            $byKey[ $answer['key'] ] = $answer['display'];
        }

        foreach ( $layout['fields'] as $key ) {
            $row[] = $byKey[ $key ] ?? '';
        }

        $amounts = [];

        foreach ( is_array( $entry['breakdown']['lines'] ?? null ) ? $entry['breakdown']['lines'] : [] as $line ) {
            $amount = is_array( $line ) ? ( $line['amount'] ?? null ) : null;

            if ( is_string( $line['key'] ?? null ) && ( is_int( $amount ) || is_float( $amount ) ) ) {
                $amounts[ $line['key'] ] = Values::stringify( $amount );
            }
        }

        foreach ( $layout['calculations'] as $key ) {
            $row[] = $amounts[ $key ] ?? '';
        }

        return $row;
    }

    /**
     * @param array<string, mixed> $item sahə və ya hesablama
     */
    private static function heading( array $item, string $key ): string
    {
        $label = is_string( $item['label'] ?? null ) ? $item['label'] : '';

        return '' !== $label ? $label : $key;
    }
}
