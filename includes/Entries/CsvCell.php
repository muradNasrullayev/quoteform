<?php

declare(strict_types=1);

namespace Quoteform\Entries;

/**
 * CSV xanasının təhlükəsizliyi (yeni spec §5). WordPress-dən asılı deyil.
 *
 * Saxlama XAMDIR (Plan 06 R15) — bu təmizləmə yalnız CSV-yə yazılanda olur.
 */
final class CsvCell
{
    /** Excel/Sheets/Calc bunlarla başlayan xananı formul kimi icra edir. */
    private const TRIGGERS = [ '=', '+', '-', '@', "\t", "\r" ];

    /**
     * Tam en (fullwidth) formalar (U+FF1D, U+FF0B, U+FF0D, U+FF20): LibreOffice bunları da
     * operator kimi tanıyır (Fix round 1, controller ruling R2).
     */
    private const FULLWIDTH_TRIGGERS = [ "\u{FF1D}", "\u{FF0B}", "\u{FF0D}", "\u{FF20}" ];

    /** Adi onluq ədəd (mənfi də) formul deyil: endirimli `-25.5000` rəqəm kimi qalmalıdır. */
    private const PLAIN_NUMBER = '/^-?\d+(?:\.\d+)?$/D';

    /**
     * TAB, LF, CR xaric C0 idarəedici simvollar və DEL. Bayt səviyyəsində işləyir və
     * UTF-8 üçün təhlükəsizdir: çoxbaytlı simvolun heç bir baytı 0x80-dən kiçik deyil.
     */
    private const CONTROLS = '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/';

    /**
     * Sətir başındakı boşluqlar (space, tab, NBSP, digər Unicode boşluqlar) — `\p{Z}`
     * Unicode "separator" kateqoriyasıdır, `\s` isə TAB/CR-i tutur (Fix round 1):
     * LibreOffice boşluqla başlayan xananı da kəsib formul kimi işə salır.
     * `\p{Cf}` (Fix round 4, ruling R5): görünməz format simvolları — U+200B, U+FEFF (BOM),
     * U+2060, U+00AD, U+200E və s. — da atlanır ki, "\u{200B}=1" qoruyucudan yayınmasın.
     */
    private const LEADING_WHITESPACE = '/^[\s\p{Z}\p{Cf}]+/u';

    public static function clean( string $value ): string
    {
        // Struktur düzəliş (Fix round 3, controller ruling R3): round 2-nin bayt-səviyyəli
        // geri dönüşü natamam idi (NBSP kimi ASCII olmayan boşluqları tanımırdı). Bunun əvəzinə
        // etibarsız UTF-8 baytları ƏVVƏLCƏDƏN U+FFFD ilə əvəz olunur ki, aşağıdakı hər `/u`
        // reqeksi HƏMİŞƏ etibarlı UTF-8 üzərində işləsin. Yalnız CSV çıxışına təsir edir —
        // saxlanmış məlumat (DB-dəki `data` sütunu) toxunulmaz qalır.
        $value = self::scrub( $value );

        // Əvvəl silinir, SONRA yoxlanılır: "\x07=1" gizli baytla formul qoruyucusundan yayınmasın.
        $stripped = preg_replace( self::CONTROLS, '', $value );

        // Backstop (Fix round 3): hər hansı preg_* funksiyası (səbəbindən asılı olmayaraq) NULL/
        // false qaytarsa, ağıllı geri dönüş axtarmırıq — birbaşa sitat altına alırıq. `CONTROLS`-da
        // `/u` yoxdur və `scrub()`-dan sonra bu, praktik olaraq baş VERMƏMƏLIDIR, amma qayda
        // budur: preg_* uğursuz olanda heç vaxt qorunmamış formul qaytarılmır.
        if ( null === $stripped ) {
            return "'" . $value;
        }

        $value = $stripped;

        $isPlainNumber = preg_match( self::PLAIN_NUMBER, $value );

        if ( false === $isPlainNumber ) {
            return "'" . $value;
        }

        if ( '' === $value || 1 === $isPlainNumber ) {
            return $value;
        }

        return self::startsWithTrigger( $value ) ? "'" . $value : $value;
    }

    /**
     * Etibarsız UTF-8 baytlarını U+FFFD ilə əvəz edir (Fix round 4, ruling R5): yalnız core PHP —
     * mbstring TƏLƏB OLUNMUR (WordPress `mb_scrub()`-u polyfill etmir, plugin mbstring tələb etmir).
     * `ENT_SUBSTITUTE` etibarsız ardıcıllığı U+FFFD ilə əvəz edir; `ENT_NOQUOTES` dırnaqlara
     * toxunmur, beləliklə yalnız `&`, `<`, `>` kodlanır və `htmlspecialchars_decode()` onları
     * tək keçiddə geri qaytarır — etibarlı UTF-8 üçün (hətta hərfi `&amp;` olan mətn üçün də)
     * bu, eynilik çevrilməsidir. Qlobal `mb_substitute_character()` vəziyyətinə toxunulmur.
     */
    private static function scrub( string $value ): string
    {
        $encoded = htmlspecialchars( $value, ENT_SUBSTITUTE | ENT_NOQUOTES, 'UTF-8' );

        return htmlspecialchars_decode( $encoded, ENT_NOQUOTES );
    }

    /**
     * Sətrin (boşluqlar atılandan sonrakı) ilk simvolu formul işarəsidirmi — adi
     * (ASCII) yoxsa tam en (fullwidth) formada, boşluqdan əvvəl və ya sonra.
     */
    private static function startsWithTrigger( string $value ): bool
    {
        $trimmed = preg_replace( self::LEADING_WHITESPACE, '', $value );

        // Backstop (Fix round 3): `clean()` artıq `scrub()` ilə etibarlı UTF-8 verir, ona görə
        // bu, praktik olaraq baş VERMƏMƏLIDIR; yenə də NULL qaytarsa, "trigger tapıldı" hesab edib
        // çağıranın (clean()) sitat qoymasını təmin edirik — ağıllı geri dönüş yox, qapalı iflas.
        if ( null === $trimmed ) {
            return true;
        }

        if ( '' === $trimmed ) {
            return false;
        }

        if ( in_array( $trimmed[0], self::TRIGGERS, true ) ) {
            return true;
        }

        foreach ( self::FULLWIDTH_TRIGGERS as $trigger ) {
            if ( 0 === strncmp( $trimmed, $trigger, strlen( $trigger ) ) ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<int, string> $cells
     */
    public static function line( array $cells ): string
    {
        $buffer = fopen( 'php://memory', 'r+' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- in-memory stream for fputcsv(), not a file; WP_Filesystem does not apply.

        if ( false === $buffer ) {
            return '';
        }

        // Boş escape simvolu (PHP 7.4+) = RFC 4180: dırnaq yalnız ikiqat dırnaqla qaçırılır.
        // Default "\\" ilə `C:\"x"` kimi mətn Excel-in oxuya bilmədiyi xana yazırdı.
        fputcsv( $buffer, array_map( [ self::class, 'clean' ], $cells ), ',', '"', '' );
        rewind( $buffer );
        $line = (string) stream_get_contents( $buffer );
        fclose( $buffer ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- in-memory stream for fputcsv(), not a file; WP_Filesystem does not apply.

        return $line;
    }
}
