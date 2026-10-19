# Quoteform Plan 01 — İfadə Mühərriki Implementasiya Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quoteform üçün PHP və JavaScript-də eyni nəticəni verən, `eval()` istifadə etməyən təhlükəsiz ifadə mühərriki qurmaq — ortaq fixture faylı ilə paritet test qapısına bağlanmış.

**Architecture:** Mühərrik `includes/Engine/` (PHP) və `frontend-src/engine/` (JS) altında iki dəfə yazılır. Hər iki tərəf eyni AST formasını (plain array / plain object) istifadə edir: tokenizer → precedence-climbing parser → evaluator. Hər iki implementasiya `tests/fixtures/expressions.json` və `tests/fixtures/calculations.json` fayllarını oxuyur; PHPUnit və Jest eyni halları icra edir. Mühərrik WordPress-dən **tamamilə asılı deyil** — nə forma, nə entry, nə HTTP bilir; o, yalnız ifadə mətni + düz dəyişən map-i alıb nəticə qaytarır.

**Tech Stack:** PHP 7.4+, PHPUnit 9.6, Composer PSR-4; JavaScript ES2020 (ESM), Jest 29, Babel.

**Spec:** `docs/superpowers/specs/2026-09-15-quoteform-design.md`

## Global Constraints

Bu bölmə hər task-ın tələblərinə avtomatik daxildir.

- PHP minimum: **7.4**. WordPress minimum: **6.2** — bu döşəmə bütöv-branch düzəliş raundunda 6.0-dan qaldırıldı, çünki builder `createRoot` işlədir (spec §5.1).
- **`eval()` və dinamik kod icrası heç bir yerdə istifadə olunmur** — nə PHP-də, nə JS-də.
- PHP namespace: `Quoteform\`. PSR-4 kökü: `includes/`.
- Funksiya/hook/option/sabit prefiksi: `qform_`. DB cədvəl prefiksi: `{wp_prefix}qform_`. CSS prefiksi: `.quoteform_`. Text domain: `quoteform`.
- PHP metod adlandırması: **camelCase**. Sinif adları: PascalCase. Sinif faylları: bir sinif = bir fayl, fayl adı sinif adı ilə eynidir.
- JS: ESM (`export` / `import`), camelCase funksiya adları.
- Mühərrik `frontend-src/engine/` və `includes/Engine/` xaricində heç nəyə istinad etmir; xüsusilə `Engine/` altında `WP_`, `wp_`, `$wpdb`, `add_action` kimi heç nə görünməməlidir.
- **Paritet qaydası:** mühərrikə hər yeni funksiya, operator və ya davranış əlavə edən dəyişiklik `tests/fixtures/` altına uyğun hal əlavə etməlidir. Fixture-suz davranış qəbul edilmir.
- Float müqayisələri testlərdə `1e-9` delta ilə aparılır.
- Xəta halları fixture-larda **yalnız xəta kodu** ilə yoxlanılır (mesaj mətni yox) — mesajlar lokalizasiya olunur və dillər arasında fərqlənə bilər.
- **Commit qaydası:** plan commit addımlarını ehtiva edir, lakin icra zamanı `git commit` yalnız istifadəçinin açıq icazəsi ilə edilir. İcraçı commit mesajını hazırlayıb göstərir və dayanır.

---

## Fayl Strukturu

Bu planın yaratdığı və dəyişdirdiyi fayllar:

| Fayl | Məsuliyyəti |
|---|---|
| `quoteform.php` | Plugin başlıqları, sabitlər, autoloader-in yüklənməsi |
| `composer.json` | PSR-4 autoload, PHPUnit dev asılılığı |
| `package.json` | Jest + Babel dev asılılıqları |
| `phpunit.xml` | PHPUnit konfiqurasiyası |
| `jest.config.js` | Jest konfiqurasiyası |
| `babel.config.js` | Babel preset (ESM → Node) |
| `.gitignore` | vendor, node_modules, build |
| `includes/Engine/Token.php` | Token dəyər obyekti və tip sabitləri |
| `includes/Engine/ExpressionException.php` | Mühərrikin yeganə xəta tipi, kod slug-ı ilə |
| `includes/Engine/Lexer.php` | Mətn → token massivi |
| `includes/Engine/Parser.php` | Token massivi → AST |
| `includes/Engine/Values.php` | Tip çevirmə və müqayisə qaydaları |
| `includes/Engine/Functions.php` | Daxili funksiyalar, paritetli `round` |
| `includes/Engine/Evaluator.php` | AST → nəticə |
| `includes/Engine/Expression.php` | Fasad: compile + cache + evaluate + variables |
| `includes/Engine/CalculationGraph.php` | Adlandırılmış hesablamaların DAG sıralaması və icrası |
| `frontend-src/engine/errors.js` | JS xəta tipi |
| `frontend-src/engine/lexer.js` | JS tokenizer |
| `frontend-src/engine/parser.js` | JS parser |
| `frontend-src/engine/values.js` | JS tip çevirmə qaydaları |
| `frontend-src/engine/functions.js` | JS funksiyalar, paritetli `round` |
| `frontend-src/engine/evaluator.js` | JS evaluator |
| `frontend-src/engine/compile.js` | JS kompilyasiya keşi və fasad köməkçiləri |
| `frontend-src/engine/index.js` | JS paket barreli (yalnız re-export) |
| `frontend-src/engine/calculations.js` | JS hesablama DAG-ı |
| `tests/fixtures/expressions.json` | **Paritet qapısı** — ifadə halları |
| `tests/fixtures/calculations.json` | **Paritet qapısı** — DAG halları |
| `tests/php/bootstrap.php` | PHPUnit bootstrap |
| `tests/php/Engine/*Test.php` | PHP vahid testləri |
| `tests/js/engine/*.test.js` | JS vahid testləri |

---

## AST Forması (hər iki dildə eynidir)

PHP-də assosiativ massiv, JS-də plain object. Struktur qəsdən eynidir ki, paritet pozulduqda fərq dərhal görünsün.

```
{ "type": "number",  "value": <float> }
{ "type": "string",  "value": <string> }
{ "type": "boolean", "value": <bool> }
{ "type": "var",     "name": <string> }
{ "type": "unary",   "op": "-" | "!", "operand": <node> }
{ "type": "binary",  "op": <string>, "left": <node>, "right": <node> }
{ "type": "call",    "name": <string>, "args": [<node>, ...] }
```

Operator prioriteti (aşağıdan yuxarı): `||` 1 → `&&` 2 → `== != > < >= <=` 3 → `+ -` 4 → `* / %` 5 → unar `- !` → mötərizə/funksiya.

---
## Task 1: Layihə skeleti və test alətləri

**Files:**
- Create: `quoteform.php`
- Create: `composer.json`
- Create: `package.json`
- Create: `phpunit.xml`
- Create: `jest.config.js`
- Create: `babel.config.js`
- Create: `.gitignore`
- Create: `tests/php/bootstrap.php`
- Test: `tests/php/SmokeTest.php`
- Test: `tests/js/smoke.test.js`

**Interfaces:**
- Consumes: heç nə (ilk task).
- Produces: `Quoteform\` PSR-4 autoload kökü `includes/`; `composer test` PHPUnit-i işə salır; `npm test` Jest-i işə salır; `tests/php/bootstrap.php` Composer autoloader-ini yükləyir.

- [ ] **Step 1: `.gitignore` yarat**

```
/vendor/
/node_modules/
/build/
/.superpowers/
.phpunit.result.cache
.DS_Store
*.log
```

- [ ] **Step 2: `composer.json` yarat**

```json
{
  "name": "quoteform/quoteform",
  "description": "Multi-step quote calculator and conditional logic forms for WordPress",
  "type": "wordpress-plugin",
  "license": "GPL-2.0-or-later",
  "require": {
    "php": ">=7.4"
  },
  "require-dev": {
    "phpunit/phpunit": "^9.6"
  },
  "autoload": {
    "psr-4": {
      "Quoteform\\": "includes/"
    }
  },
  "autoload-dev": {
    "psr-4": {
      "Quoteform\\Tests\\": "tests/php/"
    }
  },
  "scripts": {
    "test": "phpunit"
  },
  "config": {
    "optimize-autoloader": true
  }
}
```

- [ ] **Step 3: `phpunit.xml` yarat**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="tests/php/bootstrap.php"
         colors="true"
         convertDeprecationsToExceptions="true"
         failOnWarning="true">
    <testsuites>
        <testsuite name="quoteform">
            <directory>tests/php</directory>
        </testsuite>
    </testsuites>
</phpunit>
```

- [ ] **Step 4: `tests/php/bootstrap.php` yarat**

```php
<?php

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';
```

- [ ] **Step 5: `package.json`, `jest.config.js`, `babel.config.js` yarat**

`package.json`:

```json
{
  "name": "quoteform",
  "version": "0.1.0",
  "private": true,
  "license": "GPL-2.0-or-later",
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@babel/preset-env": "^7.24.0",
    "babel-jest": "^29.7.0",
    "jest": "^29.7.0"
  }
}
```

`babel.config.js`:

```js
module.exports = {
	presets: [ [ '@babel/preset-env', { targets: { node: 'current' } } ] ],
};
```

`jest.config.js`:

```js
module.exports = {
	testEnvironment: 'node',
	testMatch: [ '<rootDir>/tests/js/**/*.test.js' ],
};
```

- [ ] **Step 6: `quoteform.php` plugin giriş faylını yarat**

```php
<?php
/**
 * Plugin Name:       Quoteform
 * Plugin URI:        https://wordpress.org/plugins/quoteform/
 * Description:       Multi-step quote calculator and conditional logic forms. Free, with no paid upgrade.
 * Version:           0.1.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            Murad Nasrullayev
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       quoteform
 * Domain Path:       /languages
 *
 * @package Quoteform
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'QFORM_VERSION', '0.1.0' );
define( 'QFORM_FILE', __FILE__ );
define( 'QFORM_PATH', plugin_dir_path( __FILE__ ) );
define( 'QFORM_URL', plugin_dir_url( __FILE__ ) );

require_once QFORM_PATH . 'vendor/autoload.php';
```

- [ ] **Step 7: Hər iki smoke testini yaz**

`tests/php/SmokeTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests;

use PHPUnit\Framework\TestCase;

final class SmokeTest extends TestCase
{
    public function testAutoloaderIsAvailable(): void
    {
        $this->assertTrue( class_exists( \Composer\Autoload\ClassLoader::class ) );
    }

    public function testPhpVersionMeetsFloor(): void
    {
        $this->assertTrue( version_compare( PHP_VERSION, '7.4', '>=' ) );
    }
}
```

`tests/js/smoke.test.js`:

```js
describe( 'toolchain', () => {
	it( 'runs ESM sources through babel', () => {
		const value = [ 1, 2, 3 ].reduce( ( a, b ) => a + b, 0 );
		expect( value ).toBe( 6 );
	} );
} );
```

- [ ] **Step 8: Asılılıqları qur və hər iki test dəstini işə sal**

Run: `composer install && npm install && composer test && npm test`
Expected: PHPUnit 2 test PASS, Jest 1 test PASS.

- [ ] **Step 9: Commit hazırla**

```bash
git add .gitignore composer.json package.json phpunit.xml jest.config.js babel.config.js quoteform.php tests/
git commit -m "chore: scaffold plugin skeleton with phpunit and jest"
```

---

## Task 2: PHP Lexer

**Files:**
- Create: `includes/Engine/Token.php`
- Create: `includes/Engine/ExpressionException.php`
- Create: `includes/Engine/Lexer.php`
- Test: `tests/php/Engine/LexerTest.php`

**Interfaces:**
- Consumes: Task 1-dən `Quoteform\` autoload kökü.
- Produces:
  - `Quoteform\Engine\Token` — public `$type`, `$value`, `$position`; sabitlər `NUMBER, STRING, BOOLEAN, VARIABLE, IDENT, OPERATOR, LPAREN, RPAREN, COMMA, EOF`.
  - `Quoteform\Engine\ExpressionException extends \RuntimeException` — `__construct(string $codeSlug, string $message, int $position = 0, array $context = [])`, metodlar `getCodeSlug(): string`, `getPosition(): int`, `getContext(): array`.
  - `Quoteform\Engine\Lexer` — `__construct(string $source)`, `tokenize(): Token[]` (sonuncu element həmişə `EOF`).

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Engine/LexerTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Lexer;
use Quoteform\Engine\Token;

final class LexerTest extends TestCase
{
    /**
     * @return array<int, array{0: string, 1: mixed}>
     */
    private function tokenPairs( string $source ): array
    {
        $pairs = [];
        foreach ( ( new Lexer( $source ) )->tokenize() as $token ) {
            $pairs[] = [ $token->type, $token->value ];
        }
        return $pairs;
    }

    public function testTokenizesArithmeticWithVariable(): void
    {
        $this->assertSame(
            [
                [ Token::VARIABLE, 'room_count' ],
                [ Token::OPERATOR, '*' ],
                [ Token::NUMBER, 50.0 ],
                [ Token::OPERATOR, '+' ],
                [ Token::NUMBER, 1.5 ],
                [ Token::EOF, null ],
            ],
            $this->tokenPairs( '{room_count} * 50 + 1.5' )
        );
    }

    public function testTokenizesDottedVariable(): void
    {
        $this->assertSame(
            [ [ Token::VARIABLE, 'urgency.price' ], [ Token::EOF, null ] ],
            $this->tokenPairs( '{urgency.price}' )
        );
    }

    public function testTokenizesTwoCharacterOperatorsBeforeSingle(): void
    {
        $this->assertSame(
            [
                [ Token::NUMBER, 1.0 ],
                [ Token::OPERATOR, '>=' ],
                [ Token::NUMBER, 2.0 ],
                [ Token::OPERATOR, '&&' ],
                [ Token::NUMBER, 3.0 ],
                [ Token::OPERATOR, '!=' ],
                [ Token::NUMBER, 4.0 ],
                [ Token::EOF, null ],
            ],
            $this->tokenPairs( '1 >= 2 && 3 != 4' )
        );
    }

    public function testTokenizesStringsWithEscapes(): void
    {
        $this->assertSame(
            [ [ Token::STRING, 'ex"press' ], [ Token::EOF, null ] ],
            $this->tokenPairs( '"ex\\"press"' )
        );
    }

    public function testTokenizesBooleansAndCalls(): void
    {
        $this->assertSame(
            [
                [ Token::IDENT, 'if' ],
                [ Token::LPAREN, '(' ],
                [ Token::BOOLEAN, true ],
                [ Token::COMMA, ',' ],
                [ Token::BOOLEAN, false ],
                [ Token::COMMA, ',' ],
                [ Token::NUMBER, 0.0 ],
                [ Token::RPAREN, ')' ],
                [ Token::EOF, null ],
            ],
            $this->tokenPairs( 'if(true, false, 0)' )
        );
    }

    public function testRejectsUnterminatedVariable(): void
    {
        $this->expectException( ExpressionException::class );
        ( new Lexer( '{room_count' ) )->tokenize();
    }

    public function testRejectsUnexpectedCharacter(): void
    {
        try {
            ( new Lexer( '1 # 2' ) )->tokenize();
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unexpected_character', $exception->getCodeSlug() );
            $this->assertSame( 2, $exception->getPosition() );
        }
    }

    public function testRejectsMalformedNumber(): void
    {
        try {
            ( new Lexer( '1.2.3' ) )->tokenize();
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'malformed_number', $exception->getCodeSlug() );
        }
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `composer test -- --filter LexerTest`
Expected: FAIL — `Class "Quoteform\Engine\Lexer" not found`.

- [ ] **Step 3: `Token` və `ExpressionException` siniflərini yaz**

`includes/Engine/Token.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class Token
{
    public const NUMBER   = 'number';
    public const STRING   = 'string';
    public const BOOLEAN  = 'boolean';
    public const VARIABLE = 'variable';
    public const IDENT    = 'ident';
    public const OPERATOR = 'operator';
    public const LPAREN   = 'lparen';
    public const RPAREN   = 'rparen';
    public const COMMA    = 'comma';
    public const EOF      = 'eof';

    /** @var string */
    public $type;

    /** @var mixed */
    public $value;

    /** @var int */
    public $position;

    /**
     * @param mixed $value
     */
    public function __construct( string $type, $value, int $position )
    {
        $this->type     = $type;
        $this->value    = $value;
        $this->position = $position;
    }
}
```

`includes/Engine/ExpressionException.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Engine;

use RuntimeException;

final class ExpressionException extends RuntimeException
{
    /** @var string */
    private $codeSlug;

    /** @var int */
    private $position;

    /** @var array<string, mixed> */
    private $context;

    /**
     * @param array<string, mixed> $context
     */
    public function __construct( string $codeSlug, string $message, int $position = 0, array $context = [] )
    {
        parent::__construct( $message );

        $this->codeSlug = $codeSlug;
        $this->position = $position;
        $this->context  = $context;
    }

    public function getCodeSlug(): string
    {
        return $this->codeSlug;
    }

    public function getPosition(): int
    {
        return $this->position;
    }

    /**
     * @return array<string, mixed>
     */
    public function getContext(): array
    {
        return $this->context;
    }
}
```

- [ ] **Step 4: `Lexer` sinfini yaz**

`includes/Engine/Lexer.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class Lexer
{
    /** @var string[] İki simvollu operatorlar birsimvollulardan ƏVVƏL yoxlanılır. */
    private const OPERATORS = [ '==', '!=', '>=', '<=', '&&', '||', '>', '<', '+', '-', '*', '/', '%', '!' ];

    /** @var string */
    private $source;

    /** @var int */
    private $length;

    /** @var int */
    private $position = 0;

    public function __construct( string $source )
    {
        $this->source = $source;
        $this->length = strlen( $source );
    }

    /**
     * @return Token[]
     */
    public function tokenize(): array
    {
        $tokens = [];

        while ( $this->position < $this->length ) {
            $character = $this->source[ $this->position ];

            if ( $character === ' ' || $character === "\t" || $character === "\n" || $character === "\r" ) {
                $this->position++;
                continue;
            }

            if ( $character === '{' ) {
                $tokens[] = $this->readVariable();
                continue;
            }

            if ( $character === '"' || $character === "'" ) {
                $tokens[] = $this->readString( $character );
                continue;
            }

            if ( $this->isDigit( $character ) || ( $character === '.' && $this->isDigit( $this->peek( 1 ) ) ) ) {
                $tokens[] = $this->readNumber();
                continue;
            }

            if ( $this->isIdentifierStart( $character ) ) {
                $tokens[] = $this->readIdentifier();
                continue;
            }

            if ( $character === '(' ) {
                $tokens[] = new Token( Token::LPAREN, '(', $this->position++ );
                continue;
            }

            if ( $character === ')' ) {
                $tokens[] = new Token( Token::RPAREN, ')', $this->position++ );
                continue;
            }

            if ( $character === ',' ) {
                $tokens[] = new Token( Token::COMMA, ',', $this->position++ );
                continue;
            }

            $operator = $this->readOperator();

            if ( $operator !== null ) {
                $tokens[] = $operator;
                continue;
            }

            throw new ExpressionException(
                'unexpected_character',
                sprintf( 'Unexpected character "%s".', $character ),
                $this->position,
                [ 'character' => $character ]
            );
        }

        $tokens[] = new Token( Token::EOF, null, $this->position );

        return $tokens;
    }

    private function readVariable(): Token
    {
        $start = $this->position;
        $this->position++;
        $name = '';

        while ( $this->position < $this->length && $this->source[ $this->position ] !== '}' ) {
            $character = $this->source[ $this->position ];

            if ( ! $this->isIdentifierPart( $character ) && $character !== '.' ) {
                throw new ExpressionException(
                    'malformed_variable',
                    sprintf( 'Invalid character "%s" in a variable name.', $character ),
                    $this->position,
                    [ 'character' => $character ]
                );
            }

            $name .= $character;
            $this->position++;
        }

        if ( $this->position >= $this->length ) {
            throw new ExpressionException( 'unterminated_variable', 'A variable is missing its closing brace.', $start );
        }

        $this->position++;

        if ( $name === '' ) {
            throw new ExpressionException( 'empty_variable', 'A variable name cannot be empty.', $start );
        }

        return new Token( Token::VARIABLE, $name, $start );
    }

    private function readString( string $quote ): Token
    {
        $start = $this->position;
        $this->position++;
        $value = '';

        while ( $this->position < $this->length ) {
            $character = $this->source[ $this->position ];

            if ( $character === '\\' && $this->position + 1 < $this->length ) {
                $next = $this->source[ $this->position + 1 ];

                if ( $next === $quote || $next === '\\' ) {
                    $value .= $next;
                    $this->position += 2;
                    continue;
                }
            }

            if ( $character === $quote ) {
                $this->position++;
                return new Token( Token::STRING, $value, $start );
            }

            $value .= $character;
            $this->position++;
        }

        throw new ExpressionException( 'unterminated_string', 'A text value is missing its closing quote.', $start );
    }

    private function readNumber(): Token
    {
        $start    = $this->position;
        $raw      = '';
        $hasPoint = false;

        while ( $this->position < $this->length ) {
            $character = $this->source[ $this->position ];

            if ( $this->isDigit( $character ) ) {
                $raw .= $character;
                $this->position++;
                continue;
            }

            if ( $character === '.' ) {
                if ( $hasPoint ) {
                    throw new ExpressionException( 'malformed_number', 'A number cannot contain two decimal points.', $this->position );
                }

                $hasPoint = true;
                $raw     .= $character;
                $this->position++;
                continue;
            }

            break;
        }

        return new Token( Token::NUMBER, (float) $raw, $start );
    }

    private function readIdentifier(): Token
    {
        $start = $this->position;
        $name  = '';

        while ( $this->position < $this->length && $this->isIdentifierPart( $this->source[ $this->position ] ) ) {
            $name .= $this->source[ $this->position ];
            $this->position++;
        }

        $lowercase = strtolower( $name );

        if ( $lowercase === 'true' ) {
            return new Token( Token::BOOLEAN, true, $start );
        }

        if ( $lowercase === 'false' ) {
            return new Token( Token::BOOLEAN, false, $start );
        }

        return new Token( Token::IDENT, $lowercase, $start );
    }

    private function readOperator(): ?Token
    {
        foreach ( self::OPERATORS as $operator ) {
            $width = strlen( $operator );

            if ( substr( $this->source, $this->position, $width ) === $operator ) {
                $token = new Token( Token::OPERATOR, $operator, $this->position );
                $this->position += $width;
                return $token;
            }
        }

        return null;
    }

    private function peek( int $offset ): string
    {
        $index = $this->position + $offset;

        return $index < $this->length ? $this->source[ $index ] : '';
    }

    private function isDigit( string $character ): bool
    {
        return $character >= '0' && $character <= '9';
    }

    private function isIdentifierStart( string $character ): bool
    {
        return $character === '_'
            || ( $character >= 'a' && $character <= 'z' )
            || ( $character >= 'A' && $character <= 'Z' );
    }

    private function isIdentifierPart( string $character ): bool
    {
        return $this->isIdentifierStart( $character ) || $this->isDigit( $character );
    }
}
```

- [ ] **Step 5: Testlərin keçdiyini təsdiqlə**

Run: `composer test -- --filter LexerTest`
Expected: 8 test PASS.

- [ ] **Step 6: Commit hazırla**

```bash
git add includes/Engine/Token.php includes/Engine/ExpressionException.php includes/Engine/Lexer.php tests/php/Engine/LexerTest.php
git commit -m "feat(engine): add expression lexer"
```

---
## Task 3: PHP Parser

**Files:**
- Create: `includes/Engine/Parser.php`
- Test: `tests/php/Engine/ParserTest.php`

**Interfaces:**
- Consumes: `Quoteform\Engine\Lexer::tokenize()`, `Quoteform\Engine\Token`, `Quoteform\Engine\ExpressionException`.
- Produces: `Quoteform\Engine\Parser` — statik `Parser::parse( string $source ): array` AST kök node-unu qaytarır (forma yuxarıdakı "AST Forması" bölməsindədir).

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Engine/ParserTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Parser;

final class ParserTest extends TestCase
{
    public function testMultiplicationBindsTighterThanAddition(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '+',
                'left'  => [ 'type' => 'number', 'value' => 2.0 ],
                'right' => [
                    'type'  => 'binary',
                    'op'    => '*',
                    'left'  => [ 'type' => 'number', 'value' => 3.0 ],
                    'right' => [ 'type' => 'number', 'value' => 4.0 ],
                ],
            ],
            Parser::parse( '2 + 3 * 4' )
        );
    }

    public function testParenthesesOverridePrecedence(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '*',
                'left'  => [
                    'type'  => 'binary',
                    'op'    => '+',
                    'left'  => [ 'type' => 'number', 'value' => 2.0 ],
                    'right' => [ 'type' => 'number', 'value' => 3.0 ],
                ],
                'right' => [ 'type' => 'number', 'value' => 4.0 ],
            ],
            Parser::parse( '(2 + 3) * 4' )
        );
    }

    public function testSubtractionIsLeftAssociative(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '-',
                'left'  => [
                    'type'  => 'binary',
                    'op'    => '-',
                    'left'  => [ 'type' => 'number', 'value' => 10.0 ],
                    'right' => [ 'type' => 'number', 'value' => 3.0 ],
                ],
                'right' => [ 'type' => 'number', 'value' => 2.0 ],
            ],
            Parser::parse( '10 - 3 - 2' )
        );
    }

    public function testComparisonBindsLooserThanArithmetic(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '>',
                'left'  => [
                    'type'  => 'binary',
                    'op'    => '+',
                    'left'  => [ 'type' => 'var', 'name' => 'a' ],
                    'right' => [ 'type' => 'number', 'value' => 1.0 ],
                ],
                'right' => [ 'type' => 'number', 'value' => 5.0 ],
            ],
            Parser::parse( '{a} + 1 > 5' )
        );
    }

    public function testLogicalOrBindsLoosestOfAll(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '||',
                'left'  => [
                    'type'  => 'binary',
                    'op'    => '&&',
                    'left'  => [ 'type' => 'var', 'name' => 'a' ],
                    'right' => [ 'type' => 'var', 'name' => 'b' ],
                ],
                'right' => [ 'type' => 'var', 'name' => 'c' ],
            ],
            Parser::parse( '{a} && {b} || {c}' )
        );
    }

    public function testParsesUnaryMinusAndNot(): void
    {
        $this->assertSame(
            [
                'type'    => 'unary',
                'op'      => '-',
                'operand' => [ 'type' => 'var', 'name' => 'a' ],
            ],
            Parser::parse( '-{a}' )
        );

        $this->assertSame(
            [
                'type'    => 'unary',
                'op'      => '!',
                'operand' => [ 'type' => 'var', 'name' => 'a' ],
            ],
            Parser::parse( '!{a}' )
        );
    }

    public function testParsesFunctionCallWithArguments(): void
    {
        $this->assertSame(
            [
                'type' => 'call',
                'name' => 'round',
                'args' => [
                    [ 'type' => 'var', 'name' => 'total' ],
                    [ 'type' => 'number', 'value' => 2.0 ],
                ],
            ],
            Parser::parse( 'round({total}, 2)' )
        );
    }

    public function testParsesFunctionCallWithNoArguments(): void
    {
        $this->assertSame(
            [ 'type' => 'call', 'name' => 'sum', 'args' => [] ],
            Parser::parse( 'sum()' )
        );
    }

    public function testRejectsMissingClosingParenthesis(): void
    {
        try {
            Parser::parse( '(2 + 3' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unexpected_token', $exception->getCodeSlug() );
        }
    }

    public function testRejectsTrailingTokens(): void
    {
        try {
            Parser::parse( '1 2' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unexpected_token', $exception->getCodeSlug() );
        }
    }

    public function testRejectsEmptyExpression(): void
    {
        try {
            Parser::parse( '   ' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'empty_expression', $exception->getCodeSlug() );
        }
    }

    public function testRejectsBareIdentifierWithoutCall(): void
    {
        try {
            Parser::parse( 'round' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unexpected_token', $exception->getCodeSlug() );
        }
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `composer test -- --filter ParserTest`
Expected: FAIL — `Class "Quoteform\Engine\Parser" not found`.

- [ ] **Step 3: `Parser` sinfini yaz**

`includes/Engine/Parser.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class Parser
{
    /** @var array<string, int> */
    private const PRECEDENCE = [
        '||' => 1,
        '&&' => 2,
        '==' => 3,
        '!=' => 3,
        '>'  => 3,
        '<'  => 3,
        '>=' => 3,
        '<=' => 3,
        '+'  => 4,
        '-'  => 4,
        '*'  => 5,
        '/'  => 5,
        '%'  => 5,
    ];

    /** @var Token[] */
    private $tokens;

    /** @var int */
    private $index = 0;

    /**
     * @param Token[] $tokens
     */
    public function __construct( array $tokens )
    {
        $this->tokens = $tokens;
    }

    /**
     * @return array<string, mixed>
     */
    public static function parse( string $source ): array
    {
        return ( new self( ( new Lexer( $source ) )->tokenize() ) )->parseProgram();
    }

    /**
     * @return array<string, mixed>
     */
    public function parseProgram(): array
    {
        if ( $this->current()->type === Token::EOF ) {
            throw new ExpressionException( 'empty_expression', 'The expression is empty.', 0 );
        }

        $node = $this->parseExpression( 1 );

        if ( $this->current()->type !== Token::EOF ) {
            throw new ExpressionException(
                'unexpected_token',
                'Unexpected input after the end of the expression.',
                $this->current()->position
            );
        }

        return $node;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseExpression( int $minimumPrecedence ): array
    {
        $left = $this->parseUnary();

        while ( true ) {
            $token = $this->current();

            if ( $token->type !== Token::OPERATOR || ! isset( self::PRECEDENCE[ $token->value ] ) ) {
                break;
            }

            $precedence = self::PRECEDENCE[ $token->value ];

            if ( $precedence < $minimumPrecedence ) {
                break;
            }

            $this->index++;

            $left = [
                'type'  => 'binary',
                'op'    => $token->value,
                'left'  => $left,
                'right' => $this->parseExpression( $precedence + 1 ),
            ];
        }

        return $left;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseUnary(): array
    {
        $token = $this->current();

        if ( $token->type === Token::OPERATOR && ( $token->value === '-' || $token->value === '!' ) ) {
            $this->index++;

            return [
                'type'    => 'unary',
                'op'      => $token->value,
                'operand' => $this->parseUnary(),
            ];
        }

        return $this->parsePrimary();
    }

    /**
     * @return array<string, mixed>
     */
    private function parsePrimary(): array
    {
        $token = $this->current();

        switch ( $token->type ) {
            case Token::NUMBER:
                $this->index++;
                return [ 'type' => 'number', 'value' => $token->value ];

            case Token::STRING:
                $this->index++;
                return [ 'type' => 'string', 'value' => $token->value ];

            case Token::BOOLEAN:
                $this->index++;
                return [ 'type' => 'boolean', 'value' => $token->value ];

            case Token::VARIABLE:
                $this->index++;
                return [ 'type' => 'var', 'name' => $token->value ];

            case Token::IDENT:
                return $this->parseCall();

            case Token::LPAREN:
                $this->index++;
                $node = $this->parseExpression( 1 );
                $this->expect( Token::RPAREN );
                return $node;
        }

        throw new ExpressionException(
            'unexpected_token',
            'Unexpected token in the expression.',
            $token->position,
            [ 'token' => $token->type ]
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function parseCall(): array
    {
        $identifier = $this->current();
        $this->index++;

        if ( $this->current()->type !== Token::LPAREN ) {
            throw new ExpressionException(
                'unexpected_token',
                sprintf( '"%s" must be followed by "(".', $identifier->value ),
                $identifier->position,
                [ 'name' => $identifier->value ]
            );
        }

        $this->index++;
        $arguments = [];

        if ( $this->current()->type !== Token::RPAREN ) {
            while ( true ) {
                $arguments[] = $this->parseExpression( 1 );

                if ( $this->current()->type === Token::COMMA ) {
                    $this->index++;
                    continue;
                }

                break;
            }
        }

        $this->expect( Token::RPAREN );

        return [
            'type' => 'call',
            'name' => $identifier->value,
            'args' => $arguments,
        ];
    }

    private function expect( string $type ): Token
    {
        $token = $this->current();

        if ( $token->type !== $type ) {
            throw new ExpressionException(
                'unexpected_token',
                sprintf( 'Expected %s but found %s.', $type, $token->type ),
                $token->position,
                [ 'expected' => $type, 'found' => $token->type ]
            );
        }

        $this->index++;

        return $token;
    }

    private function current(): Token
    {
        return $this->tokens[ $this->index ];
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `composer test -- --filter ParserTest`
Expected: 12 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Engine/Parser.php tests/php/Engine/ParserTest.php
git commit -m "feat(engine): add precedence-climbing expression parser"
```

---

## Task 4: PHP tip çevirmə və müqayisə qaydaları (`Values`)

Bu task mühərrikin ən incə hissəsidir: bütün coercion qaydaları bir yerdə toplanır ki, JS tərəfi onları sətir-sətir təkrarlaya bilsin.

**Files:**
- Create: `includes/Engine/Values.php`
- Test: `tests/php/Engine/ValuesTest.php`

**Interfaces:**
- Consumes: `Quoteform\Engine\ExpressionException`.
- Produces: `Quoteform\Engine\Values` — statik metodlar:
  - `toNumber( $value, int $position = 0 ): float`
  - `toBool( $value ): bool`
  - `isNumericLike( $value ): bool`
  - `equals( $left, $right ): bool`
  - `compare( $left, $right, int $position = 0 ): int` (`-1`, `0`, `1`)

**Qaydalar (spec §7.3 və §7.5):**

| Vəziyyət | Davranış |
|---|---|
| `toNumber`: `null`, `''` | `0.0` |
| `toNumber`: `true` / `false` | `1.0` / `0.0` |
| `toNumber`: rəqəmsal sətir | float-a çevrilir |
| `toNumber`: qeyri-rəqəmsal sətir və ya massiv | `type_error` atır |
| `toBool`: `false`, `0`, `0.0`, `''`, `null`, `[]` | `false` |
| `equals`: tiplər fərqlidirsə | `false` (yəni `"5" == 5` → `false`) |
| `compare`: hər iki tərəf rəqəmsal-bənzərdirsə | ədədi müqayisə |
| `compare`: hər iki tərəf sətirdirsə | leksikoqrafik (ISO tarixlər üçün işləyir) |
| `compare`: qarışıq tiplər | `type_error` atır |

`null` hər iki müqayisə metodunda əvvəlcə `''`-ə normalizasiya olunur.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Engine/ValuesTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Values;

final class ValuesTest extends TestCase
{
    public function testEmptyValuesBecomeZero(): void
    {
        $this->assertSame( 0.0, Values::toNumber( null ) );
        $this->assertSame( 0.0, Values::toNumber( '' ) );
    }

    public function testBooleansBecomeOneAndZero(): void
    {
        $this->assertSame( 1.0, Values::toNumber( true ) );
        $this->assertSame( 0.0, Values::toNumber( false ) );
    }

    public function testNumericStringsConvert(): void
    {
        $this->assertSame( 12.5, Values::toNumber( '12.5' ) );
        $this->assertSame( -3.0, Values::toNumber( '-3' ) );
    }

    public function testWhitespacePaddedNumberIsNotNumeric(): void
    {
        try {
            Values::toNumber( ' 12' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'type_error', $exception->getCodeSlug() );
        }
    }

    public function testNonNumericStringThrowsTypeError(): void
    {
        try {
            Values::toNumber( 'express' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'type_error', $exception->getCodeSlug() );
        }
    }

    public function testArrayThrowsTypeError(): void
    {
        try {
            Values::toNumber( [ 'a', 'b' ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'type_error', $exception->getCodeSlug() );
        }
    }

    public function testTruthiness(): void
    {
        $this->assertFalse( Values::toBool( null ) );
        $this->assertFalse( Values::toBool( '' ) );
        $this->assertFalse( Values::toBool( 0.0 ) );
        $this->assertFalse( Values::toBool( false ) );
        $this->assertFalse( Values::toBool( [] ) );
        $this->assertTrue( Values::toBool( '0' ) );
        $this->assertTrue( Values::toBool( 1.0 ) );
        $this->assertTrue( Values::toBool( [ 'a' ] ) );
    }

    public function testEqualityIsTypeStrict(): void
    {
        $this->assertFalse( Values::equals( '5', 5.0 ) );
        $this->assertTrue( Values::equals( 5.0, 5.0 ) );
        $this->assertTrue( Values::equals( 'express', 'express' ) );
        $this->assertFalse( Values::equals( true, 1.0 ) );
    }

    public function testEmptyEqualsEmptyString(): void
    {
        $this->assertTrue( Values::equals( null, '' ) );
    }

    public function testNumericComparison(): void
    {
        $this->assertSame( 1, Values::compare( 5.0, 2.0 ) );
        $this->assertSame( -1, Values::compare( 2.0, 5.0 ) );
        $this->assertSame( 0, Values::compare( 5.0, 5.0 ) );
    }

    public function testNumericStringComparesNumerically(): void
    {
        $this->assertSame( 1, Values::compare( 10.0, '9' ) );
    }

    public function testStringComparisonIsLexicographic(): void
    {
        $this->assertSame( 1, Values::compare( '2026-03-01', '2026-01-01' ) );
    }

    public function testMixedTypeComparisonThrows(): void
    {
        try {
            Values::compare( 5.0, 'express' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'type_error', $exception->getCodeSlug() );
        }
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `composer test -- --filter ValuesTest`
Expected: FAIL — `Class "Quoteform\Engine\Values" not found`.

- [ ] **Step 3: `Values` sinfini yaz**

`includes/Engine/Values.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class Values
{
    /**
     * @param mixed $value
     */
    public static function toNumber( $value, int $position = 0 ): float
    {
        if ( $value === null || $value === '' ) {
            return 0.0;
        }

        if ( is_bool( $value ) ) {
            return $value ? 1.0 : 0.0;
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return (float) $value;
        }

        if ( is_string( $value ) && self::isNumericString( $value ) ) {
            return (float) $value;
        }

        throw new ExpressionException(
            'type_error',
            'This value cannot be used in a calculation.',
            $position,
            [ 'value' => is_array( $value ) ? 'list' : (string) $value ]
        );
    }

    /**
     * @param mixed $value
     */
    public static function toBool( $value ): bool
    {
        if ( $value === null || $value === '' || $value === false ) {
            return false;
        }

        if ( is_array( $value ) ) {
            return $value !== [];
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return ( (float) $value ) !== 0.0;
        }

        return true;
    }

    /**
     * @param mixed $value
     */
    public static function isNumericLike( $value ): bool
    {
        if ( $value === null || $value === '' || is_bool( $value ) ) {
            return true;
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return true;
        }

        return is_string( $value ) && self::isNumericString( $value );
    }

    /**
     * Rəqəmsal sətir qaydası JS tərəfi ilə EYNİ regex-dir (frontend-src/engine/values.js).
     * PHP-nin is_numeric() funksiyası boşluqlu və hex sətirləri fərqli qəbul etdiyi üçün istifadə edilmir.
     */
    private static function isNumericString( string $candidate ): bool
    {
        return preg_match( '/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/', $candidate ) === 1;
    }

    /**
     * @param mixed $left
     * @param mixed $right
     */
    public static function equals( $left, $right ): bool
    {
        $left  = $left === null ? '' : $left;
        $right = $right === null ? '' : $right;

        $leftType  = self::typeOf( $left );
        $rightType = self::typeOf( $right );

        if ( $leftType !== $rightType ) {
            return false;
        }

        if ( $leftType === 'list' ) {
            if ( count( $left ) !== count( $right ) ) {
                return false;
            }

            foreach ( $left as $index => $item ) {
                if ( ! array_key_exists( $index, $right ) || $item !== $right[ $index ] ) {
                    return false;
                }
            }

            return true;
        }

        if ( $leftType === 'number' ) {
            return ( (float) $left ) === ( (float) $right );
        }

        return $left === $right;
    }

    /**
     * @param mixed $left
     * @param mixed $right
     * @return int -1, 0 or 1
     */
    public static function compare( $left, $right, int $position = 0 ): int
    {
        $left  = $left === null ? '' : $left;
        $right = $right === null ? '' : $right;

        if ( self::isNumericLike( $left ) && self::isNumericLike( $right ) ) {
            $leftNumber  = self::toNumber( $left, $position );
            $rightNumber = self::toNumber( $right, $position );

            if ( $leftNumber === $rightNumber ) {
                return 0;
            }

            return $leftNumber < $rightNumber ? -1 : 1;
        }

        if ( is_string( $left ) && is_string( $right ) ) {
            $result = strcmp( $left, $right );

            if ( $result === 0 ) {
                return 0;
            }

            return $result < 0 ? -1 : 1;
        }

        throw new ExpressionException(
            'type_error',
            'These two values cannot be compared with each other.',
            $position
        );
    }

    /**
     * @param mixed $value
     */
    private static function typeOf( $value ): string
    {
        if ( is_bool( $value ) ) {
            return 'boolean';
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return 'number';
        }

        if ( is_array( $value ) ) {
            return 'list';
        }

        return 'string';
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `composer test -- --filter ValuesTest`
Expected: 13 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Engine/Values.php tests/php/Engine/ValuesTest.php
git commit -m "feat(engine): add value coercion and comparison rules"
```

---
## Task 5: PHP daxili funksiyalar və paritetli `round`

**Files:**
- Create: `includes/Engine/Functions.php`
- Test: `tests/php/Engine/FunctionsTest.php`

**Interfaces:**
- Consumes: `Quoteform\Engine\Values`, `Quoteform\Engine\ExpressionException`.
- Produces: `Quoteform\Engine\Functions` — `has( string $name ): bool`, `call( string $name, array $arguments, int $position = 0 )`, statik `roundHalfAwayFromZero( float $value, int $precision = 0 ): float`.
- Qeyd: `if` **bu sinifdə deyil** — o, arqumentlərini tənbəl qiymətləndirdiyi üçün Task 6-da `Evaluator` içində xüsusi hal kimi işlənir.

### Niyə PHP-nin öz `round()`-u istifadə edilmir

Spec §7.5 tələb edir ki, PHP və JS eyni nəticəni versin. İki yerli funksiya bunu vermir:

- `Math.round( -2.5 )` JS-də `-2`, PHP-də `round( -2.5 )` isə `-3`-dür (half-away-from-zero).
- `1.005 * 100` float-da `100.49999999999999`-dur. Sadə `Math.round` `1.00` verir, PHP-nin `round()`-u isə daxili düzəlişi sayəsində `1.01` verir.

Ona görə hər iki dil **eyni əl ilə yazılmış alqoritmi** istifadə edir. Alqoritm yalnız `abs`, `floor`, vurma və bölmə əməliyyatlarından ibarətdir — hər iki dil IEEE-754 float64 istifadə etdiyi üçün nəticələr bit-bit eynidir:

```
factor  = 10 ^ precision
scaled  = value * factor
abs     = |scaled|
epsilon = abs * 1e-12          // float təmsil xətasını kompensasiya edir
rounded = floor( abs + 0.5 + epsilon )
sign    = value < 0 ? -1 : 1
result  = (sign * rounded) / factor
```

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Engine/FunctionsTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Functions;

final class FunctionsTest extends TestCase
{
    /** @var Functions */
    private $functions;

    protected function setUp(): void
    {
        $this->functions = new Functions();
    }

    public function testKnownFunctionsAreRegistered(): void
    {
        foreach ( [ 'min', 'max', 'round', 'ceil', 'floor', 'abs', 'sum' ] as $name ) {
            $this->assertTrue( $this->functions->has( $name ), $name . ' should be registered' );
        }

        $this->assertFalse( $this->functions->has( 'sqrt' ) );
        $this->assertFalse( $this->functions->has( 'if' ), 'if is handled lazily by the evaluator' );
    }

    public function testRoundsHalfAwayFromZero(): void
    {
        $this->assertSame( 3.0, Functions::roundHalfAwayFromZero( 2.5 ) );
        $this->assertSame( -3.0, Functions::roundHalfAwayFromZero( -2.5 ) );
        $this->assertSame( 1.0, Functions::roundHalfAwayFromZero( 0.5 ) );
        $this->assertSame( 2.0, Functions::roundHalfAwayFromZero( 1.5 ) );
        $this->assertSame( 0.0, Functions::roundHalfAwayFromZero( 0.0 ) );
    }

    public function testCompensatesForFloatRepresentationError(): void
    {
        $this->assertSame( 1.01, Functions::roundHalfAwayFromZero( 1.005, 2 ) );
        $this->assertSame( 2.68, Functions::roundHalfAwayFromZero( 2.675, 2 ) );
        $this->assertSame( 1.15, Functions::roundHalfAwayFromZero( 1.145, 2 ) );
    }

    public function testRoundsToNegativePrecision(): void
    {
        $this->assertSame( 130.0, Functions::roundHalfAwayFromZero( 125.0, -1 ) );
    }

    public function testMinAndMax(): void
    {
        $this->assertSame( 2.0, $this->functions->call( 'min', [ 5.0, 2.0, 9.0 ] ) );
        $this->assertSame( 9.0, $this->functions->call( 'max', [ 5.0, 2.0, 9.0 ] ) );
    }

    public function testCeilFloorAbs(): void
    {
        $this->assertSame( 3.0, $this->functions->call( 'ceil', [ 2.1 ] ) );
        $this->assertSame( 2.0, $this->functions->call( 'floor', [ 2.9 ] ) );
        $this->assertSame( 4.5, $this->functions->call( 'abs', [ -4.5 ] ) );
    }

    public function testSum(): void
    {
        $this->assertSame( 10.0, $this->functions->call( 'sum', [ 1.0, 2.0, 3.0, 4.0 ] ) );
        $this->assertSame( 0.0, $this->functions->call( 'sum', [] ) );
    }

    public function testRoundDefaultsToZeroPrecision(): void
    {
        $this->assertSame( 3.0, $this->functions->call( 'round', [ 2.5 ] ) );
        $this->assertSame( 2.46, $this->functions->call( 'round', [ 2.4567, 2.0 ] ) );
    }

    public function testEmptyArgumentIsTreatedAsZero(): void
    {
        $this->assertSame( 0.0, $this->functions->call( 'abs', [ null ] ) );
        $this->assertSame( 0.0, $this->functions->call( 'min', [ '', 5.0 ] ) );
    }

    public function testWrongArgumentCountThrows(): void
    {
        try {
            $this->functions->call( 'abs', [ 1.0, 2.0 ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'wrong_argument_count', $exception->getCodeSlug() );
        }
    }

    public function testMinWithNoArgumentsThrows(): void
    {
        try {
            $this->functions->call( 'min', [] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'wrong_argument_count', $exception->getCodeSlug() );
        }
    }

    public function testUnknownFunctionThrows(): void
    {
        try {
            $this->functions->call( 'sqrt', [ 4.0 ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unknown_function', $exception->getCodeSlug() );
        }
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `composer test -- --filter FunctionsTest`
Expected: FAIL — `Class "Quoteform\Engine\Functions" not found`.

- [ ] **Step 3: `Functions` sinfini yaz**

`includes/Engine/Functions.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class Functions
{
    /**
     * Funksiya adı => [minimum arqument sayı, maksimum arqument sayı və ya null (limitsiz)].
     *
     * @var array<string, array{0: int, 1: int|null}>
     */
    private const SIGNATURES = [
        'min'   => [ 1, null ],
        'max'   => [ 1, null ],
        'sum'   => [ 0, null ],
        'round' => [ 1, 2 ],
        'ceil'  => [ 1, 1 ],
        'floor' => [ 1, 1 ],
        'abs'   => [ 1, 1 ],
    ];

    public function has( string $name ): bool
    {
        return isset( self::SIGNATURES[ $name ] );
    }

    /**
     * @param array<int, mixed> $arguments
     */
    public function call( string $name, array $arguments, int $position = 0 ): float
    {
        if ( ! $this->has( $name ) ) {
            throw new ExpressionException(
                'unknown_function',
                sprintf( 'There is no function called "%s".', $name ),
                $position,
                [ 'name' => $name ]
            );
        }

        [ $minimum, $maximum ] = self::SIGNATURES[ $name ];
        $count                 = count( $arguments );

        if ( $count < $minimum || ( $maximum !== null && $count > $maximum ) ) {
            throw new ExpressionException(
                'wrong_argument_count',
                sprintf( '"%s" was given %d argument(s).', $name, $count ),
                $position,
                [ 'name' => $name, 'given' => $count, 'min' => $minimum, 'max' => $maximum ]
            );
        }

        $numbers = [];

        foreach ( $arguments as $argument ) {
            $numbers[] = Values::toNumber( $argument, $position );
        }

        switch ( $name ) {
            case 'min':
                return (float) min( $numbers );

            case 'max':
                return (float) max( $numbers );

            case 'sum':
                return array_sum( $numbers ) + 0.0;

            case 'round':
                $precision = isset( $numbers[1] ) ? (int) $numbers[1] : 0;
                return self::roundHalfAwayFromZero( $numbers[0], $precision );

            case 'ceil':
                return ceil( $numbers[0] );

            case 'floor':
                return floor( $numbers[0] );

            case 'abs':
                return abs( $numbers[0] );
        }

        throw new ExpressionException( 'unknown_function', sprintf( 'There is no function called "%s".', $name ), $position );
    }

    /**
     * Yarını sıfırdan uzağa yuvarlaqlaşdırır.
     *
     * Bu alqoritm JS tərəfində sətir-sətir təkrarlanır (frontend-src/engine/functions.js).
     * PHP-nin round() və JS-in Math.round() funksiyaları fərqli nəticələr verdiyi üçün
     * heç biri istifadə edilmir — bax tests/fixtures/expressions.json paritet halları.
     */
    public static function roundHalfAwayFromZero( float $value, int $precision = 0 ): float
    {
        if ( ! is_finite( $value ) ) {
            throw new ExpressionException( 'type_error', 'Cannot round a value that is not a finite number.' );
        }

        $factor   = pow( 10, $precision );
        $scaled   = $value * $factor;
        $absolute = abs( $scaled );
        $epsilon  = $absolute * 1e-12;
        $rounded  = floor( $absolute + 0.5 + $epsilon );
        $sign     = $value < 0 ? -1.0 : 1.0;

        return ( $sign * $rounded ) / $factor;
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `composer test -- --filter FunctionsTest`
Expected: 12 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Engine/Functions.php tests/php/Engine/FunctionsTest.php
git commit -m "feat(engine): add built-in functions with parity-safe rounding"
```

---
## Task 6: PHP Evaluator

**Files:**
- Create: `includes/Engine/Evaluator.php`
- Test: `tests/php/Engine/EvaluatorTest.php`

**Interfaces:**
- Consumes: `Quoteform\Engine\Parser::parse()`, `Values`, `Functions`, `ExpressionException`.
- Produces: `Quoteform\Engine\Evaluator` — `__construct( array $variables, ?Functions $functions = null )`, `evaluate( array $node )` → `float|string|bool`.

**Qeydlər:**
- `if( cond, a, b )` burada **xüsusi hal** kimi işlənir və yalnız seçilmiş budağı qiymətləndirir. Bu ona görə vacibdir ki, `if( {x} == 0, 0, 100 / {x} )` sıfıra bölmə xətası verməsin.
- `&&` və `||` qısa dövrəlidir və həmişə `bool` qaytarır (operandın özünü yox) — bu, iki dil arasında paritetin sadə saxlanması üçündür.
- AST node-ları mövqe daşımır, ona görə icra vaxtı xətalarının mövqeyi `0`-dır. Mövqe məlumatı parse vaxtı xətalarında (Lexer/Parser) mövcuddur; builder icra xətasında `{name}` sətrini mənbədə axtarmaqla yeri tapır.
- Naməlum dəyişən üçün Levenshtein məsafəsi ilə təklif verilir. **Təklif mətni paritet fixture-larında yoxlanılmır** — yalnız `unknown_variable` kodu yoxlanılır.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Engine/EvaluatorTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Evaluator;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Parser;

final class EvaluatorTest extends TestCase
{
    /**
     * @param array<string, mixed> $variables
     * @return mixed
     */
    private function evaluateSource( string $source, array $variables = [] )
    {
        return ( new Evaluator( $variables ) )->evaluate( Parser::parse( $source ) );
    }

    public function testArithmeticRespectsPrecedence(): void
    {
        $this->assertSame( 14.0, $this->evaluateSource( '2 + 3 * 4' ) );
        $this->assertSame( 20.0, $this->evaluateSource( '(2 + 3) * 4' ) );
    }

    public function testResolvesVariables(): void
    {
        $this->assertSame( 390.0, $this->evaluateSource( '{room_count} * 50 + {bathrooms} * 120', [ 'room_count' => 3.0, 'bathrooms' => 2.0 ] ) );
    }

    public function testEmptyVariableCountsAsZero(): void
    {
        $this->assertSame( 150.0, $this->evaluateSource( '{room_count} * 50 + {bathrooms} * 120', [ 'room_count' => 3.0, 'bathrooms' => '' ] ) );
    }

    public function testUnaryMinusAndNot(): void
    {
        $this->assertSame( -5.0, $this->evaluateSource( '-{a}', [ 'a' => 5.0 ] ) );
        $this->assertTrue( $this->evaluateSource( '!{a}', [ 'a' => 0.0 ] ) );
        $this->assertFalse( $this->evaluateSource( '!{a}', [ 'a' => 1.0 ] ) );
    }

    public function testModuloUsesFloatRemainder(): void
    {
        $this->assertSame( 1.0, $this->evaluateSource( '7 % 3' ) );
        $this->assertSame( 0.5, $this->evaluateSource( '7.5 % 3.5' ) );
    }

    public function testComparisonsReturnBooleans(): void
    {
        $this->assertTrue( $this->evaluateSource( '{a} > 2', [ 'a' => 5.0 ] ) );
        $this->assertFalse( $this->evaluateSource( '{a} >= 6', [ 'a' => 5.0 ] ) );
        $this->assertTrue( $this->evaluateSource( '{tier} == "express"', [ 'tier' => 'express' ] ) );
        $this->assertFalse( $this->evaluateSource( '{tier} == 5', [ 'tier' => '5' ] ) );
    }

    public function testLogicalOperatorsShortCircuit(): void
    {
        $this->assertFalse( $this->evaluateSource( '{a} && (1 / 0)', [ 'a' => 0.0 ] ) );
        $this->assertTrue( $this->evaluateSource( '{a} || (1 / 0)', [ 'a' => 1.0 ] ) );
    }

    public function testIfEvaluatesOnlyTheChosenBranch(): void
    {
        $this->assertSame( 0.0, $this->evaluateSource( 'if({x} == 0, 0, 100 / {x})', [ 'x' => 0.0 ] ) );
        $this->assertSame( 25.0, $this->evaluateSource( 'if({x} == 0, 0, 100 / {x})', [ 'x' => 4.0 ] ) );
    }

    public function testIfReturnsNonNumericBranches(): void
    {
        $this->assertSame( 'yes', $this->evaluateSource( 'if({a}, "yes", "no")', [ 'a' => 1.0 ] ) );
    }

    public function testIfWithWrongArgumentCountThrows(): void
    {
        try {
            $this->evaluateSource( 'if(1, 2)' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'wrong_argument_count', $exception->getCodeSlug() );
        }
    }

    public function testDivisionByZeroThrows(): void
    {
        try {
            $this->evaluateSource( '1 / 0' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'division_by_zero', $exception->getCodeSlug() );
        }
    }

    public function testModuloByZeroThrows(): void
    {
        try {
            $this->evaluateSource( '1 % 0' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'division_by_zero', $exception->getCodeSlug() );
        }
    }

    public function testUnknownVariableThrowsWithSuggestion(): void
    {
        try {
            $this->evaluateSource( '{bathroms}', [ 'bathrooms' => 2.0 ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unknown_variable', $exception->getCodeSlug() );
            $this->assertSame( 'bathrooms', $exception->getContext()['suggestion'] );
        }
    }

    public function testUnknownVariableWithNoCloseMatchHasNoSuggestion(): void
    {
        try {
            $this->evaluateSource( '{zzzzzzzz}', [ 'bathrooms' => 2.0 ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertNull( $exception->getContext()['suggestion'] );
        }
    }

    public function testCallsRegisteredFunctions(): void
    {
        $this->assertSame( 2.46, $this->evaluateSource( 'round({a}, 2)', [ 'a' => 2.4567 ] ) );
        $this->assertSame( 99.0, $this->evaluateSource( 'max({a}, 99)', [ 'a' => 50.0 ] ) );
    }

    public function testCombinedRealWorldExpression(): void
    {
        $variables = [ 'subtotal' => 390.0, 'urgency' => 'express' ];

        $this->assertSame( 507.0, $this->evaluateSource( 'round(if({urgency} == "express", {subtotal} * 1.3, {subtotal}), 2)', $variables ) );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `composer test -- --filter EvaluatorTest`
Expected: FAIL — `Class "Quoteform\Engine\Evaluator" not found`.

- [ ] **Step 3: `Evaluator` sinfini yaz**

`includes/Engine/Evaluator.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class Evaluator
{
    /** @var array<string, mixed> */
    private $variables;

    /** @var Functions */
    private $functions;

    /**
     * @param array<string, mixed> $variables
     */
    public function __construct( array $variables, ?Functions $functions = null )
    {
        $this->variables = $variables;
        $this->functions = $functions ?? new Functions();
    }

    /**
     * @param array<string, mixed> $node
     * @return float|string|bool|array<int, mixed>
     */
    public function evaluate( array $node )
    {
        switch ( $node['type'] ) {
            case 'number':
            case 'string':
            case 'boolean':
                return $node['value'];

            case 'var':
                return $this->resolveVariable( $node['name'] );

            case 'unary':
                return $this->evaluateUnary( $node );

            case 'binary':
                return $this->evaluateBinary( $node );

            case 'call':
                return $this->evaluateCall( $node );
        }

        throw new ExpressionException(
            'unknown_node',
            sprintf( 'Unsupported expression node "%s".', (string) $node['type'] )
        );
    }

    /**
     * @return mixed
     */
    private function resolveVariable( string $name )
    {
        if ( array_key_exists( $name, $this->variables ) ) {
            return $this->variables[ $name ];
        }

        throw new ExpressionException(
            'unknown_variable',
            sprintf( 'There is no field or calculation called "%s".', $name ),
            0,
            [ 'name' => $name, 'suggestion' => $this->suggestVariable( $name ) ]
        );
    }

    private function suggestVariable( string $name ): ?string
    {
        $best         = null;
        $bestDistance = PHP_INT_MAX;

        foreach ( array_keys( $this->variables ) as $candidate ) {
            $candidate = (string) $candidate;
            $distance  = levenshtein( $name, $candidate );

            if ( $distance < $bestDistance ) {
                $bestDistance = $distance;
                $best         = $candidate;
            }
        }

        $threshold = (int) max( 2, floor( strlen( $name ) / 3 ) );

        return ( $best !== null && $bestDistance <= $threshold ) ? $best : null;
    }

    /**
     * @param array<string, mixed> $node
     * @return float|bool
     */
    private function evaluateUnary( array $node )
    {
        $operand = $this->evaluate( $node['operand'] );

        if ( $node['op'] === '-' ) {
            return -Values::toNumber( $operand );
        }

        return ! Values::toBool( $operand );
    }

    /**
     * @param array<string, mixed> $node
     * @return float|bool
     */
    private function evaluateBinary( array $node )
    {
        $operator = $node['op'];

        if ( $operator === '&&' ) {
            return Values::toBool( $this->evaluate( $node['left'] ) )
                && Values::toBool( $this->evaluate( $node['right'] ) );
        }

        if ( $operator === '||' ) {
            return Values::toBool( $this->evaluate( $node['left'] ) )
                || Values::toBool( $this->evaluate( $node['right'] ) );
        }

        $left  = $this->evaluate( $node['left'] );
        $right = $this->evaluate( $node['right'] );

        switch ( $operator ) {
            case '==':
                return Values::equals( $left, $right );

            case '!=':
                return ! Values::equals( $left, $right );

            case '>':
                return Values::compare( $left, $right ) > 0;

            case '<':
                return Values::compare( $left, $right ) < 0;

            case '>=':
                return Values::compare( $left, $right ) >= 0;

            case '<=':
                return Values::compare( $left, $right ) <= 0;
        }

        $leftNumber  = Values::toNumber( $left );
        $rightNumber = Values::toNumber( $right );

        switch ( $operator ) {
            case '+':
                return $leftNumber + $rightNumber;

            case '-':
                return $leftNumber - $rightNumber;

            case '*':
                return $leftNumber * $rightNumber;

            case '/':
                if ( $rightNumber === 0.0 ) {
                    throw new ExpressionException( 'division_by_zero', 'Cannot divide by zero.' );
                }

                return $leftNumber / $rightNumber;

            case '%':
                if ( $rightNumber === 0.0 ) {
                    throw new ExpressionException( 'division_by_zero', 'Cannot take a remainder with zero.' );
                }

                return fmod( $leftNumber, $rightNumber );
        }

        throw new ExpressionException( 'unknown_operator', sprintf( 'Unsupported operator "%s".', (string) $operator ) );
    }

    /**
     * @param array<string, mixed> $node
     * @return mixed
     */
    private function evaluateCall( array $node )
    {
        if ( $node['name'] === 'if' ) {
            if ( count( $node['args'] ) !== 3 ) {
                throw new ExpressionException(
                    'wrong_argument_count',
                    sprintf( '"if" needs exactly 3 arguments, %d given.', count( $node['args'] ) ),
                    0,
                    [ 'name' => 'if', 'given' => count( $node['args'] ), 'min' => 3, 'max' => 3 ]
                );
            }

            $condition = Values::toBool( $this->evaluate( $node['args'][0] ) );

            return $this->evaluate( $node['args'][ $condition ? 1 : 2 ] );
        }

        $arguments = [];

        foreach ( $node['args'] as $argument ) {
            $arguments[] = $this->evaluate( $argument );
        }

        return $this->functions->call( $node['name'], $arguments );
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `composer test -- --filter EvaluatorTest`
Expected: 16 test PASS.

- [ ] **Step 5: Bütün PHP testlərini işə sal**

Run: `composer test`
Expected: bütün dəstlər PASS.

- [ ] **Step 6: Commit hazırla**

```bash
git add includes/Engine/Evaluator.php tests/php/Engine/EvaluatorTest.php
git commit -m "feat(engine): add AST evaluator with lazy if and short-circuit logic"
```

---
## Task 7: PHP `Expression` fasadı və AST keşi

**Files:**
- Create: `includes/Engine/Expression.php`
- Test: `tests/php/Engine/ExpressionTest.php`

**Interfaces:**
- Consumes: `Parser`, `Evaluator`.
- Produces: `Quoteform\Engine\Expression` — statik metodlar:
  - `compile( string $source ): array` — AST, sorğu daxilində keşlənir
  - `evaluate( string $source, array $variables )` — nəticə
  - `variables( string $source ): string[]` — ifadədəki unikal dəyişən adları (ilk görünmə sırası ilə)
  - `clearCache(): void`
  - `cacheSize(): int`

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Engine/ExpressionTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Expression;

final class ExpressionTest extends TestCase
{
    protected function setUp(): void
    {
        Expression::clearCache();
    }

    public function testEvaluatesFromSource(): void
    {
        $this->assertSame( 390.0, Expression::evaluate( '{a} * 50 + {b} * 120', [ 'a' => 3.0, 'b' => 2.0 ] ) );
    }

    public function testCompilesOncePerSource(): void
    {
        $this->assertSame( 0, Expression::cacheSize() );

        Expression::evaluate( '1 + 1', [] );
        Expression::evaluate( '1 + 1', [] );

        $this->assertSame( 1, Expression::cacheSize() );

        Expression::evaluate( '2 + 2', [] );

        $this->assertSame( 2, Expression::cacheSize() );
    }

    public function testClearCacheEmptiesTheCache(): void
    {
        Expression::evaluate( '1 + 1', [] );
        Expression::clearCache();

        $this->assertSame( 0, Expression::cacheSize() );
    }

    public function testCollectsVariableNamesInOrder(): void
    {
        $this->assertSame(
            [ 'urgency', 'subtotal' ],
            Expression::variables( 'if({urgency} == "express", {subtotal} * 1.3, {subtotal})' )
        );
    }

    public function testCollectsVariablesFromNestedNodes(): void
    {
        $this->assertSame(
            [ 'a', 'b', 'c' ],
            Expression::variables( 'round(max({a}, {b}) + -{c}, 2)' )
        );
    }

    public function testReturnsEmptyListWhenNoVariables(): void
    {
        $this->assertSame( [], Expression::variables( '2 + 3 * 4' ) );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `composer test -- --filter ExpressionTest`
Expected: FAIL — `Class "Quoteform\Engine\Expression" not found`.

- [ ] **Step 3: `Expression` sinfini yaz**

`includes/Engine/Expression.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class Expression
{
    /** @var array<string, array<string, mixed>> */
    private static $cache = [];

    /**
     * @return array<string, mixed>
     */
    public static function compile( string $source ): array
    {
        $key = md5( $source );

        if ( ! isset( self::$cache[ $key ] ) ) {
            self::$cache[ $key ] = Parser::parse( $source );
        }

        return self::$cache[ $key ];
    }

    /**
     * @param array<string, mixed> $variables
     * @return mixed
     */
    public static function evaluate( string $source, array $variables )
    {
        return ( new Evaluator( $variables ) )->evaluate( self::compile( $source ) );
    }

    /**
     * @return string[]
     */
    public static function variables( string $source ): array
    {
        $names = [];

        self::collectVariables( self::compile( $source ), $names );

        return array_values( array_unique( $names ) );
    }

    public static function clearCache(): void
    {
        self::$cache = [];
    }

    public static function cacheSize(): int
    {
        return count( self::$cache );
    }

    /**
     * @param array<string, mixed> $node
     * @param string[]             $names
     */
    private static function collectVariables( array $node, array &$names ): void
    {
        switch ( $node['type'] ) {
            case 'var':
                $names[] = $node['name'];
                return;

            case 'unary':
                self::collectVariables( $node['operand'], $names );
                return;

            case 'binary':
                self::collectVariables( $node['left'], $names );
                self::collectVariables( $node['right'], $names );
                return;

            case 'call':
                foreach ( $node['args'] as $argument ) {
                    self::collectVariables( $argument, $names );
                }
                return;
        }
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `composer test -- --filter ExpressionTest`
Expected: 6 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Engine/Expression.php tests/php/Engine/ExpressionTest.php
git commit -m "feat(engine): add expression facade with AST cache"
```

---

## Task 8: Paritet fixture faylı və PHP icraçısı

Bu task spec §7.5-in əsas tələbini qurur: PHP və JS **eyni faylı** oxuyur.

**Files:**
- Create: `tests/fixtures/expressions.json`
- Test: `tests/php/Engine/ExpressionParityTest.php`

**Interfaces:**
- Consumes: `Quoteform\Engine\Expression`, `Quoteform\Engine\ExpressionException`.
- Produces: `tests/fixtures/expressions.json` — Task 13-də Jest tərəfindən eyni formada oxunur.

**Fixture formatı:**

```
{
  "version": 1,
  "cases": [
    { "id": "<unikal slug>", "expr": "<ifadə>", "vars": { ... }, "expect": <number|string|bool> },
    { "id": "<unikal slug>", "expr": "<ifadə>", "vars": { ... }, "error": "<xəta kodu>" }
  ]
}
```

Hər hal ya `expect`, ya `error` daşıyır — ikisi birlikdə yox. Ədədi `expect` `1e-9` delta ilə müqayisə olunur; `string` və `bool` dəqiq müqayisə olunur.

- [ ] **Step 1: Fixture faylını yarat**

`tests/fixtures/expressions.json`:

```json
{
  "version": 1,
  "cases": [
    { "id": "arith-precedence", "expr": "2 + 3 * 4", "vars": {}, "expect": 14 },
    { "id": "arith-parentheses", "expr": "(2 + 3) * 4", "vars": {}, "expect": 20 },
    { "id": "arith-left-assoc-minus", "expr": "10 - 3 - 2", "vars": {}, "expect": 5 },
    { "id": "arith-left-assoc-div", "expr": "100 / 5 / 2", "vars": {}, "expect": 10 },
    { "id": "arith-unary-minus", "expr": "-{a} + 10", "vars": { "a": 4 }, "expect": 6 },
    { "id": "arith-double-unary", "expr": "--{a}", "vars": { "a": 4 }, "expect": 4 },
    { "id": "arith-modulo-int", "expr": "7 % 3", "vars": {}, "expect": 1 },
    { "id": "arith-modulo-float", "expr": "7.5 % 3.5", "vars": {}, "expect": 0.5 },
    { "id": "arith-modulo-negative", "expr": "-7 % 3", "vars": {}, "expect": -1 },

    { "id": "var-basic", "expr": "{room_count} * 50 + {bathrooms} * 120", "vars": { "room_count": 3, "bathrooms": 2 }, "expect": 390 },
    { "id": "var-empty-string-is-zero", "expr": "{a} + 10", "vars": { "a": "" }, "expect": 10 },
    { "id": "var-null-is-zero", "expr": "{a} + 10", "vars": { "a": null }, "expect": 10 },
    { "id": "var-bool-true-is-one", "expr": "{a} + 10", "vars": { "a": true }, "expect": 11 },
    { "id": "var-bool-false-is-zero", "expr": "{a} + 10", "vars": { "a": false }, "expect": 10 },
    { "id": "var-numeric-string", "expr": "{a} * 2", "vars": { "a": "12.5" }, "expect": 25 },
    { "id": "var-dotted-price", "expr": "{urgency.price} + 10", "vars": { "urgency.price": 60 }, "expect": 70 },

    { "id": "cmp-greater-true", "expr": "{a} > 2", "vars": { "a": 5 }, "expect": true },
    { "id": "cmp-greater-false", "expr": "{a} > 5", "vars": { "a": 5 }, "expect": false },
    { "id": "cmp-gte-boundary", "expr": "{a} >= 5", "vars": { "a": 5 }, "expect": true },
    { "id": "cmp-string-equality", "expr": "{tier} == \"express\"", "vars": { "tier": "express" }, "expect": true },
    { "id": "cmp-type-strict-no-coercion", "expr": "{tier} == 5", "vars": { "tier": "5" }, "expect": false },
    { "id": "cmp-not-equals", "expr": "{tier} != \"express\"", "vars": { "tier": "standard" }, "expect": true },
    { "id": "cmp-null-equals-empty-string", "expr": "{a} == \"\"", "vars": { "a": null }, "expect": true },
    { "id": "cmp-bool-not-equal-number", "expr": "{a} == 1", "vars": { "a": true }, "expect": false },
    { "id": "cmp-numeric-string-ordered", "expr": "10 > \"9\"", "vars": {}, "expect": true },
    { "id": "cmp-iso-date-lexicographic", "expr": "{d} > \"2026-01-01\"", "vars": { "d": "2026-03-01" }, "expect": true },
    { "id": "cmp-list-equal", "expr": "{a} == {b}", "vars": { "a": [ "x", "y" ], "b": [ "x", "y" ] }, "expect": true },
    { "id": "cmp-list-type-strict", "expr": "{a} == {b}", "vars": { "a": [ 1 ], "b": [ "1" ] }, "expect": false },
    { "id": "cmp-list-different-length", "expr": "{a} == {b}", "vars": { "a": [ "x" ], "b": [ "x", "y" ] }, "expect": false },

    { "id": "logic-and-true", "expr": "{a} > 1 && {b} > 1", "vars": { "a": 2, "b": 2 }, "expect": true },
    { "id": "logic-or-false", "expr": "{a} > 5 || {b} > 5", "vars": { "a": 2, "b": 2 }, "expect": false },
    { "id": "logic-and-short-circuits", "expr": "{a} && (1 / 0)", "vars": { "a": 0 }, "expect": false },
    { "id": "logic-or-short-circuits", "expr": "{a} || (1 / 0)", "vars": { "a": 1 }, "expect": true },
    { "id": "logic-not", "expr": "!{a}", "vars": { "a": 0 }, "expect": true },
    { "id": "logic-precedence-or-loosest", "expr": "true || false && false", "vars": {}, "expect": true },

    { "id": "if-true-branch", "expr": "if({a} > 1, 100, 200)", "vars": { "a": 5 }, "expect": 100 },
    { "id": "if-false-branch", "expr": "if({a} > 1, 100, 200)", "vars": { "a": 0 }, "expect": 200 },
    { "id": "if-lazy-avoids-division-by-zero", "expr": "if({x} == 0, 0, 100 / {x})", "vars": { "x": 0 }, "expect": 0 },
    { "id": "if-returns-string", "expr": "if({a}, \"yes\", \"no\")", "vars": { "a": 1 }, "expect": "yes" },
    { "id": "if-nested", "expr": "if({a} > 10, \"big\", if({a} > 5, \"mid\", \"small\"))", "vars": { "a": 7 }, "expect": "mid" },

    { "id": "fn-min", "expr": "min({a}, 2, 9)", "vars": { "a": 5 }, "expect": 2 },
    { "id": "fn-max", "expr": "max({a}, 2, 9)", "vars": { "a": 5 }, "expect": 9 },
    { "id": "fn-sum", "expr": "sum(1, 2, 3, 4)", "vars": {}, "expect": 10 },
    { "id": "fn-sum-empty", "expr": "sum()", "vars": {}, "expect": 0 },
    { "id": "fn-ceil", "expr": "ceil(2.1)", "vars": {}, "expect": 3 },
    { "id": "fn-floor", "expr": "floor(2.9)", "vars": {}, "expect": 2 },
    { "id": "fn-abs", "expr": "abs(-4.5)", "vars": {}, "expect": 4.5 },

    { "id": "round-half-up-positive", "expr": "round(2.5)", "vars": {}, "expect": 3 },
    { "id": "round-half-away-negative", "expr": "round(-2.5)", "vars": {}, "expect": -3 },
    { "id": "round-half-one", "expr": "round(0.5)", "vars": {}, "expect": 1 },
    { "id": "round-half-two", "expr": "round(1.5)", "vars": {}, "expect": 2 },
    { "id": "round-zero", "expr": "round(0)", "vars": {}, "expect": 0 },
    { "id": "round-float-error-1005", "expr": "round(1.005, 2)", "vars": {}, "expect": 1.01 },
    { "id": "round-float-error-2675", "expr": "round(2.675, 2)", "vars": {}, "expect": 2.68 },
    { "id": "round-float-error-1145", "expr": "round(1.145, 2)", "vars": {}, "expect": 1.15 },
    { "id": "round-negative-precision", "expr": "round(125, -1)", "vars": {}, "expect": 130 },
    { "id": "round-negative-value-precision", "expr": "round(-1.005, 2)", "vars": {}, "expect": -1.01 },

    { "id": "real-world-express-surcharge", "expr": "round(if({urgency} == \"express\", {subtotal} * 1.3, {subtotal}), 2)", "vars": { "urgency": "express", "subtotal": 390 }, "expect": 507 },
    { "id": "real-world-minimum-charge", "expr": "round(max({room_count} * 50 + {bathrooms} * 120, 99), 2)", "vars": { "room_count": 0, "bathrooms": 0 }, "expect": 99 },

    { "id": "error-division-by-zero", "expr": "1 / 0", "vars": {}, "error": "division_by_zero" },
    { "id": "error-modulo-by-zero", "expr": "1 % 0", "vars": {}, "error": "division_by_zero" },
    { "id": "error-unknown-variable", "expr": "{nope}", "vars": { "a": 1 }, "error": "unknown_variable" },
    { "id": "error-unknown-function", "expr": "sqrt(4)", "vars": {}, "error": "unknown_function" },
    { "id": "error-if-wrong-argument-count", "expr": "if(1, 2)", "vars": {}, "error": "wrong_argument_count" },
    { "id": "error-abs-wrong-argument-count", "expr": "abs(1, 2)", "vars": {}, "error": "wrong_argument_count" },
    { "id": "error-whitespace-padded-number", "expr": "{a} + 1", "vars": { "a": " 12" }, "error": "type_error" },
    { "id": "error-non-numeric-string-arithmetic", "expr": "{tier} + 1", "vars": { "tier": "express" }, "error": "type_error" },
    { "id": "error-list-arithmetic", "expr": "{extras} + 1", "vars": { "extras": [ "a", "b" ] }, "error": "type_error" },
    { "id": "error-mixed-type-comparison", "expr": "5 > {tier}", "vars": { "tier": "express" }, "error": "type_error" },
    { "id": "error-unterminated-variable", "expr": "{room_count", "vars": {}, "error": "unterminated_variable" },
    { "id": "error-unterminated-string", "expr": "\"abc", "vars": {}, "error": "unterminated_string" },
    { "id": "error-unexpected-character", "expr": "1 # 2", "vars": {}, "error": "unexpected_character" },
    { "id": "error-malformed-number", "expr": "1.2.3", "vars": {}, "error": "malformed_number" },
    { "id": "error-missing-closing-paren", "expr": "(2 + 3", "vars": {}, "error": "unexpected_token" },
    { "id": "error-trailing-tokens", "expr": "1 2", "vars": {}, "error": "unexpected_token" },
    { "id": "error-empty-expression", "expr": "   ", "vars": {}, "error": "empty_expression" }
  ]
}
```

- [ ] **Step 2: PHP paritet icraçısını yaz**

`tests/php/Engine/ExpressionParityTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Expression;
use Quoteform\Engine\ExpressionException;

/**
 * Bu testlər tests/fixtures/expressions.json faylını oxuyur.
 * Eyni fayl Jest tərəfindən də oxunur (tests/js/engine/parity.test.js).
 * İki tərəf fərqli nəticə verirsə, paritet pozulub.
 */
final class ExpressionParityTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function caseProvider(): array
    {
        $path = __DIR__ . '/../../fixtures/expressions.json';

        if ( ! file_exists( $path ) ) {
            throw new \RuntimeException( 'Fixture file is missing: ' . $path );
        }

        $decoded = json_decode( (string) file_get_contents( $path ), true );

        if ( ! is_array( $decoded ) || ! isset( $decoded['cases'] ) ) {
            throw new \RuntimeException( 'Fixture file is malformed: ' . $path );
        }

        $provided = [];

        foreach ( $decoded['cases'] as $case ) {
            $provided[ $case['id'] ] = [ $case ];
        }

        return $provided;
    }

    /**
     * @dataProvider caseProvider
     * @param array<string, mixed> $case
     */
    public function testFixtureCase( array $case ): void
    {
        $hasExpect = array_key_exists( 'expect', $case );
        $hasError  = array_key_exists( 'error', $case );

        $this->assertTrue(
            $hasExpect !== $hasError,
            sprintf( 'Case "%s" must declare exactly one of "expect" or "error".', $case['id'] )
        );

        Expression::clearCache();

        if ( $hasError ) {
            try {
                Expression::evaluate( $case['expr'], $case['vars'] );
                $this->fail( sprintf( 'Case "%s" should have raised "%s".', $case['id'], $case['error'] ) );
            } catch ( ExpressionException $exception ) {
                $this->assertSame( $case['error'], $exception->getCodeSlug(), $case['id'] );
            }

            return;
        }

        $actual   = Expression::evaluate( $case['expr'], $case['vars'] );
        $expected = $case['expect'];

        if ( is_bool( $expected ) || is_string( $expected ) ) {
            $this->assertSame( $expected, $actual, $case['id'] );
            return;
        }

        // Tip qoruyucusu: (float) çevirməsi olmadan yanlış TİP səssizcə keçərdi —
        // (float) false === 0.0, (float) "abc" === 0.0. Paritet qapısı yanlış tipi də tutmalıdır.
        $this->assertTrue(
            is_int( $actual ) || is_float( $actual ),
            sprintf( 'Case "%s" expected a number but the engine returned %s.', $case['id'], gettype( $actual ) )
        );

        $this->assertEqualsWithDelta( (float) $expected, (float) $actual, 1e-9, $case['id'] );
    }

    public function testFixtureIdsAreUnique(): void
    {
        $decoded = json_decode( (string) file_get_contents( __DIR__ . '/../../fixtures/expressions.json' ), true );
        $ids     = array_column( $decoded['cases'], 'id' );

        $this->assertSame( count( $ids ), count( array_unique( $ids ) ), 'Fixture ids must be unique.' );
    }
}
```

- [ ] **Step 3: Paritet testlərini işə sal**

Run: `composer test -- --filter ExpressionParityTest`
Expected: 76 fixture halı + `testFixtureIdsAreUnique` PASS.

- [ ] **Step 4: Bütün PHP dəstini işə sal**

Run: `composer test`
Expected: PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add tests/fixtures/expressions.json tests/php/Engine/ExpressionParityTest.php
git commit -m "test(engine): add shared expression parity fixtures and php runner"
```

---
## Task 9: JS xəta tipi və lexer

JS implementasiyası PHP-nin güzgüsüdür. Struktur, ad və qayda sırası qəsdən eynidir — paritet pozulduqda fərqi tapmaq asan olsun.

**Files:**
- Create: `frontend-src/engine/errors.js`
- Create: `frontend-src/engine/lexer.js`
- Test: `tests/js/engine/lexer.test.js`

**Interfaces:**
- Consumes: Task 1-dən Jest + Babel.
- Produces:
  - `ExpressionError` (named export, `errors.js`) — `codeSlug`, `position`, `context` sahələri.
  - `TOKEN` (named export, `lexer.js`) — `{ NUMBER, STRING, BOOLEAN, VARIABLE, IDENT, OPERATOR, LPAREN, RPAREN, COMMA, EOF }`.
  - `tokenize( source )` (named export, `lexer.js`) — token obyektləri massivi `{ type, value, position }`, sonuncusu `EOF`.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/js/engine/lexer.test.js`:

```js
import { ExpressionError } from '../../../frontend-src/engine/errors';
import { TOKEN, tokenize } from '../../../frontend-src/engine/lexer';

const pairs = ( source ) => tokenize( source ).map( ( token ) => [ token.type, token.value ] );

describe( 'tokenize', () => {
	it( 'tokenizes arithmetic with a variable', () => {
		expect( pairs( '{room_count} * 50 + 1.5' ) ).toEqual( [
			[ TOKEN.VARIABLE, 'room_count' ],
			[ TOKEN.OPERATOR, '*' ],
			[ TOKEN.NUMBER, 50 ],
			[ TOKEN.OPERATOR, '+' ],
			[ TOKEN.NUMBER, 1.5 ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'tokenizes a dotted variable', () => {
		expect( pairs( '{urgency.price}' ) ).toEqual( [
			[ TOKEN.VARIABLE, 'urgency.price' ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'prefers two-character operators over single ones', () => {
		expect( pairs( '1 >= 2 && 3 != 4' ) ).toEqual( [
			[ TOKEN.NUMBER, 1 ],
			[ TOKEN.OPERATOR, '>=' ],
			[ TOKEN.NUMBER, 2 ],
			[ TOKEN.OPERATOR, '&&' ],
			[ TOKEN.NUMBER, 3 ],
			[ TOKEN.OPERATOR, '!=' ],
			[ TOKEN.NUMBER, 4 ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'tokenizes strings with escapes', () => {
		expect( pairs( '"ex\\"press"' ) ).toEqual( [
			[ TOKEN.STRING, 'ex"press' ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'tokenizes booleans and calls', () => {
		expect( pairs( 'if(true, false, 0)' ) ).toEqual( [
			[ TOKEN.IDENT, 'if' ],
			[ TOKEN.LPAREN, '(' ],
			[ TOKEN.BOOLEAN, true ],
			[ TOKEN.COMMA, ',' ],
			[ TOKEN.BOOLEAN, false ],
			[ TOKEN.COMMA, ',' ],
			[ TOKEN.NUMBER, 0 ],
			[ TOKEN.RPAREN, ')' ],
			[ TOKEN.EOF, null ],
		] );
	} );

	it( 'rejects an unterminated variable', () => {
		expect( () => tokenize( '{room_count' ) ).toThrow( ExpressionError );
	} );

	it( 'reports the code slug and position of an unexpected character', () => {
		try {
			tokenize( '1 # 2' );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'unexpected_character' );
			expect( error.position ).toBe( 2 );
		}
	} );

	it( 'rejects a malformed number', () => {
		try {
			tokenize( '1.2.3' );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'malformed_number' );
		}
	} );
} );
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `npm test -- lexer`
Expected: FAIL — `Cannot find module '../../../frontend-src/engine/errors'`.

- [ ] **Step 3: `errors.js` yaz**

`frontend-src/engine/errors.js`:

```js
export class ExpressionError extends Error {
	constructor( codeSlug, message, position = 0, context = {} ) {
		super( message );

		this.name = 'ExpressionError';
		this.codeSlug = codeSlug;
		this.position = position;
		this.context = context;
	}
}
```

- [ ] **Step 4: `lexer.js` yaz**

`frontend-src/engine/lexer.js`:

```js
import { ExpressionError } from './errors';

export const TOKEN = {
	NUMBER: 'number',
	STRING: 'string',
	BOOLEAN: 'boolean',
	VARIABLE: 'variable',
	IDENT: 'ident',
	OPERATOR: 'operator',
	LPAREN: 'lparen',
	RPAREN: 'rparen',
	COMMA: 'comma',
	EOF: 'eof',
};

// İki simvollu operatorlar birsimvollulardan ƏVVƏL yoxlanılır (PHP Lexer::OPERATORS ilə eyni sıra).
const OPERATORS = [ '==', '!=', '>=', '<=', '&&', '||', '>', '<', '+', '-', '*', '/', '%', '!' ];

const isDigit = ( character ) => character >= '0' && character <= '9';

const isIdentifierStart = ( character ) =>
	character === '_' ||
	( character >= 'a' && character <= 'z' ) ||
	( character >= 'A' && character <= 'Z' );

const isIdentifierPart = ( character ) => isIdentifierStart( character ) || isDigit( character );

export function tokenize( source ) {
	const length = source.length;
	const tokens = [];
	let position = 0;

	const peek = ( offset ) => ( position + offset < length ? source[ position + offset ] : '' );

	const readVariable = () => {
		const start = position;
		position++;
		let name = '';

		while ( position < length && source[ position ] !== '}' ) {
			const character = source[ position ];

			if ( ! isIdentifierPart( character ) && character !== '.' ) {
				throw new ExpressionError(
					'malformed_variable',
					`Invalid character "${ character }" in a variable name.`,
					position,
					{ character }
				);
			}

			name += character;
			position++;
		}

		if ( position >= length ) {
			throw new ExpressionError( 'unterminated_variable', 'A variable is missing its closing brace.', start );
		}

		position++;

		if ( name === '' ) {
			throw new ExpressionError( 'empty_variable', 'A variable name cannot be empty.', start );
		}

		return { type: TOKEN.VARIABLE, value: name, position: start };
	};

	const readString = ( quote ) => {
		const start = position;
		position++;
		let value = '';

		while ( position < length ) {
			const character = source[ position ];

			if ( character === '\\' && position + 1 < length ) {
				const next = source[ position + 1 ];

				if ( next === quote || next === '\\' ) {
					value += next;
					position += 2;
					continue;
				}
			}

			if ( character === quote ) {
				position++;
				return { type: TOKEN.STRING, value, position: start };
			}

			value += character;
			position++;
		}

		throw new ExpressionError( 'unterminated_string', 'A text value is missing its closing quote.', start );
	};

	const readNumber = () => {
		const start = position;
		let raw = '';
		let hasPoint = false;

		while ( position < length ) {
			const character = source[ position ];

			if ( isDigit( character ) ) {
				raw += character;
				position++;
				continue;
			}

			if ( character === '.' ) {
				if ( hasPoint ) {
					throw new ExpressionError( 'malformed_number', 'A number cannot contain two decimal points.', position );
				}

				hasPoint = true;
				raw += character;
				position++;
				continue;
			}

			break;
		}

		return { type: TOKEN.NUMBER, value: parseFloat( raw ), position: start };
	};

	const readIdentifier = () => {
		const start = position;
		let name = '';

		while ( position < length && isIdentifierPart( source[ position ] ) ) {
			name += source[ position ];
			position++;
		}

		const lowercase = name.toLowerCase();

		if ( lowercase === 'true' ) {
			return { type: TOKEN.BOOLEAN, value: true, position: start };
		}

		if ( lowercase === 'false' ) {
			return { type: TOKEN.BOOLEAN, value: false, position: start };
		}

		return { type: TOKEN.IDENT, value: lowercase, position: start };
	};

	const readOperator = () => {
		for ( const operator of OPERATORS ) {
			if ( source.substr( position, operator.length ) === operator ) {
				const token = { type: TOKEN.OPERATOR, value: operator, position };
				position += operator.length;
				return token;
			}
		}

		return null;
	};

	while ( position < length ) {
		const character = source[ position ];

		if ( character === ' ' || character === '\t' || character === '\n' || character === '\r' ) {
			position++;
			continue;
		}

		if ( character === '{' ) {
			tokens.push( readVariable() );
			continue;
		}

		if ( character === '"' || character === "'" ) {
			tokens.push( readString( character ) );
			continue;
		}

		if ( isDigit( character ) || ( character === '.' && isDigit( peek( 1 ) ) ) ) {
			tokens.push( readNumber() );
			continue;
		}

		if ( isIdentifierStart( character ) ) {
			tokens.push( readIdentifier() );
			continue;
		}

		if ( character === '(' ) {
			tokens.push( { type: TOKEN.LPAREN, value: '(', position: position++ } );
			continue;
		}

		if ( character === ')' ) {
			tokens.push( { type: TOKEN.RPAREN, value: ')', position: position++ } );
			continue;
		}

		if ( character === ',' ) {
			tokens.push( { type: TOKEN.COMMA, value: ',', position: position++ } );
			continue;
		}

		const operator = readOperator();

		if ( operator !== null ) {
			tokens.push( operator );
			continue;
		}

		throw new ExpressionError(
			'unexpected_character',
			`Unexpected character "${ character }".`,
			position,
			{ character }
		);
	}

	tokens.push( { type: TOKEN.EOF, value: null, position } );

	return tokens;
}
```

- [ ] **Step 5: Testlərin keçdiyini təsdiqlə**

Run: `npm test -- lexer`
Expected: 8 test PASS.

- [ ] **Step 6: Commit hazırla**

```bash
git add frontend-src/engine/errors.js frontend-src/engine/lexer.js tests/js/engine/lexer.test.js
git commit -m "feat(engine): add javascript lexer mirroring the php one"
```

---

## Task 10: JS Parser

**Files:**
- Create: `frontend-src/engine/parser.js`
- Test: `tests/js/engine/parser.test.js`

**Interfaces:**
- Consumes: `tokenize`, `TOKEN`, `ExpressionError`.
- Produces: `parse( source )` (named export) — PHP `Parser::parse()` ilə eyni formada AST obyekti.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/js/engine/parser.test.js`:

```js
import { ExpressionError } from '../../../frontend-src/engine/errors';
import { parse } from '../../../frontend-src/engine/parser';

describe( 'parse', () => {
	it( 'binds multiplication tighter than addition', () => {
		expect( parse( '2 + 3 * 4' ) ).toEqual( {
			type: 'binary',
			op: '+',
			left: { type: 'number', value: 2 },
			right: {
				type: 'binary',
				op: '*',
				left: { type: 'number', value: 3 },
				right: { type: 'number', value: 4 },
			},
		} );
	} );

	it( 'lets parentheses override precedence', () => {
		expect( parse( '(2 + 3) * 4' ) ).toEqual( {
			type: 'binary',
			op: '*',
			left: {
				type: 'binary',
				op: '+',
				left: { type: 'number', value: 2 },
				right: { type: 'number', value: 3 },
			},
			right: { type: 'number', value: 4 },
		} );
	} );

	it( 'parses subtraction as left associative', () => {
		expect( parse( '10 - 3 - 2' ) ).toEqual( {
			type: 'binary',
			op: '-',
			left: {
				type: 'binary',
				op: '-',
				left: { type: 'number', value: 10 },
				right: { type: 'number', value: 3 },
			},
			right: { type: 'number', value: 2 },
		} );
	} );

	it( 'binds comparison looser than arithmetic', () => {
		expect( parse( '{a} + 1 > 5' ) ).toEqual( {
			type: 'binary',
			op: '>',
			left: {
				type: 'binary',
				op: '+',
				left: { type: 'var', name: 'a' },
				right: { type: 'number', value: 1 },
			},
			right: { type: 'number', value: 5 },
		} );
	} );

	it( 'binds logical or loosest of all', () => {
		expect( parse( '{a} && {b} || {c}' ) ).toEqual( {
			type: 'binary',
			op: '||',
			left: {
				type: 'binary',
				op: '&&',
				left: { type: 'var', name: 'a' },
				right: { type: 'var', name: 'b' },
			},
			right: { type: 'var', name: 'c' },
		} );
	} );

	it( 'parses unary minus and not', () => {
		expect( parse( '-{a}' ) ).toEqual( {
			type: 'unary',
			op: '-',
			operand: { type: 'var', name: 'a' },
		} );

		expect( parse( '!{a}' ) ).toEqual( {
			type: 'unary',
			op: '!',
			operand: { type: 'var', name: 'a' },
		} );
	} );

	it( 'parses a function call with arguments', () => {
		expect( parse( 'round({total}, 2)' ) ).toEqual( {
			type: 'call',
			name: 'round',
			args: [
				{ type: 'var', name: 'total' },
				{ type: 'number', value: 2 },
			],
		} );
	} );

	it( 'parses a function call with no arguments', () => {
		expect( parse( 'sum()' ) ).toEqual( { type: 'call', name: 'sum', args: [] } );
	} );

	it.each( [
		[ '(2 + 3', 'unexpected_token' ],
		[ '1 2', 'unexpected_token' ],
		[ 'round', 'unexpected_token' ],
		[ '   ', 'empty_expression' ],
	] )( 'rejects %s', ( source, codeSlug ) => {
		try {
			parse( source );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ExpressionError );
			expect( error.codeSlug ).toBe( codeSlug );
		}
	} );
} );
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `npm test -- parser`
Expected: FAIL — `Cannot find module '../../../frontend-src/engine/parser'`.

- [ ] **Step 3: `parser.js` yaz**

`frontend-src/engine/parser.js`:

```js
import { ExpressionError } from './errors';
import { TOKEN, tokenize } from './lexer';

// PHP Parser::PRECEDENCE ilə eyni.
const PRECEDENCE = {
	'||': 1,
	'&&': 2,
	'==': 3,
	'!=': 3,
	'>': 3,
	'<': 3,
	'>=': 3,
	'<=': 3,
	'+': 4,
	'-': 4,
	'*': 5,
	'/': 5,
	'%': 5,
};

export function parse( source ) {
	const tokens = tokenize( source );
	let index = 0;

	const current = () => tokens[ index ];

	const expect = ( type ) => {
		const token = current();

		if ( token.type !== type ) {
			throw new ExpressionError(
				'unexpected_token',
				`Expected ${ type } but found ${ token.type }.`,
				token.position,
				{ expected: type, found: token.type }
			);
		}

		index++;

		return token;
	};

	const parseExpression = ( minimumPrecedence ) => {
		let left = parseUnary();

		for (;;) {
			const token = current();

			if ( token.type !== TOKEN.OPERATOR || ! ( token.value in PRECEDENCE ) ) {
				break;
			}

			const precedence = PRECEDENCE[ token.value ];

			if ( precedence < minimumPrecedence ) {
				break;
			}

			index++;

			left = {
				type: 'binary',
				op: token.value,
				left,
				right: parseExpression( precedence + 1 ),
			};
		}

		return left;
	};

	function parseUnary() {
		const token = current();

		if ( token.type === TOKEN.OPERATOR && ( token.value === '-' || token.value === '!' ) ) {
			index++;

			return { type: 'unary', op: token.value, operand: parseUnary() };
		}

		return parsePrimary();
	}

	function parseCall() {
		const identifier = current();
		index++;

		if ( current().type !== TOKEN.LPAREN ) {
			throw new ExpressionError(
				'unexpected_token',
				`"${ identifier.value }" must be followed by "(".`,
				identifier.position,
				{ name: identifier.value }
			);
		}

		index++;
		const args = [];

		if ( current().type !== TOKEN.RPAREN ) {
			for (;;) {
				args.push( parseExpression( 1 ) );

				if ( current().type === TOKEN.COMMA ) {
					index++;
					continue;
				}

				break;
			}
		}

		expect( TOKEN.RPAREN );

		return { type: 'call', name: identifier.value, args };
	}

	function parsePrimary() {
		const token = current();

		switch ( token.type ) {
			case TOKEN.NUMBER:
				index++;
				return { type: 'number', value: token.value };

			case TOKEN.STRING:
				index++;
				return { type: 'string', value: token.value };

			case TOKEN.BOOLEAN:
				index++;
				return { type: 'boolean', value: token.value };

			case TOKEN.VARIABLE:
				index++;
				return { type: 'var', name: token.value };

			case TOKEN.IDENT:
				return parseCall();

			case TOKEN.LPAREN: {
				index++;
				const node = parseExpression( 1 );
				expect( TOKEN.RPAREN );
				return node;
			}

			default:
				throw new ExpressionError(
					'unexpected_token',
					'Unexpected token in the expression.',
					token.position,
					{ token: token.type }
				);
		}
	}

	if ( current().type === TOKEN.EOF ) {
		throw new ExpressionError( 'empty_expression', 'The expression is empty.', 0 );
	}

	const node = parseExpression( 1 );

	if ( current().type !== TOKEN.EOF ) {
		throw new ExpressionError(
			'unexpected_token',
			'Unexpected input after the end of the expression.',
			current().position
		);
	}

	return node;
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `npm test -- parser`
Expected: 12 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add frontend-src/engine/parser.js tests/js/engine/parser.test.js
git commit -m "feat(engine): add javascript expression parser"
```

---
## Task 11: JS tip qaydaları və funksiyalar

**Files:**
- Create: `frontend-src/engine/values.js`
- Create: `frontend-src/engine/functions.js`
- Test: `tests/js/engine/values.test.js`
- Test: `tests/js/engine/functions.test.js`

**Interfaces:**
- Consumes: `ExpressionError`.
- Produces (hamısı named export):
  - `values.js` — `toNumber( value, position = 0 )`, `toBool( value )`, `isNumericLike( value )`, `equals( left, right )`, `compare( left, right, position = 0 )`.
  - `functions.js` — `hasFunction( name )`, `callFunction( name, args, position = 0 )`, `roundHalfAwayFromZero( value, precision = 0 )`.

**Paritet qeydləri:**
- Rəqəmsal sətir qaydası PHP `Values::isNumericString()` ilə **eyni regex**-dir.
- PHP-də `is_int`/`is_float` ayrıdır, JS-də tək `number` tipi var. `typeOf` hər iki tərəfdə eyni dörd dəyəri qaytarır: `number`, `boolean`, `string`, `list`.
- `roundHalfAwayFromZero` PHP versiyası ilə eyni əməliyyat ardıcıllığındadır — `Math.round` istifadə **edilmir**.

- [ ] **Step 1: Uğursuz testləri yaz**

`tests/js/engine/values.test.js`:

```js
import { compare, equals, isNumericLike, toBool, toNumber } from '../../../frontend-src/engine/values';

describe( 'toNumber', () => {
	it( 'treats empty values as zero', () => {
		expect( toNumber( null ) ).toBe( 0 );
		expect( toNumber( '' ) ).toBe( 0 );
	} );

	it( 'converts booleans', () => {
		expect( toNumber( true ) ).toBe( 1 );
		expect( toNumber( false ) ).toBe( 0 );
	} );

	it( 'converts numeric strings', () => {
		expect( toNumber( '12.5' ) ).toBe( 12.5 );
		expect( toNumber( '-3' ) ).toBe( -3 );
	} );

	it.each( [ 'express', ' 12', '12abc', '0x1A' ] )( 'rejects %s', ( value ) => {
		try {
			toNumber( value );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'type_error' );
		}
	} );

	it( 'rejects a list', () => {
		try {
			toNumber( [ 'a', 'b' ] );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'type_error' );
		}
	} );
} );

describe( 'toBool', () => {
	it( 'matches the php truthiness table', () => {
		expect( toBool( null ) ).toBe( false );
		expect( toBool( '' ) ).toBe( false );
		expect( toBool( 0 ) ).toBe( false );
		expect( toBool( false ) ).toBe( false );
		expect( toBool( [] ) ).toBe( false );
		expect( toBool( '0' ) ).toBe( true );
		expect( toBool( 1 ) ).toBe( true );
		expect( toBool( [ 'a' ] ) ).toBe( true );
	} );
} );

describe( 'isNumericLike', () => {
	it( 'accepts empty, boolean, number and numeric string', () => {
		expect( isNumericLike( null ) ).toBe( true );
		expect( isNumericLike( '' ) ).toBe( true );
		expect( isNumericLike( true ) ).toBe( true );
		expect( isNumericLike( 5 ) ).toBe( true );
		expect( isNumericLike( '5' ) ).toBe( true );
		expect( isNumericLike( 'express' ) ).toBe( false );
		expect( isNumericLike( [ 1 ] ) ).toBe( false );
	} );
} );

describe( 'equals', () => {
	it( 'is type strict', () => {
		expect( equals( '5', 5 ) ).toBe( false );
		expect( equals( 5, 5 ) ).toBe( true );
		expect( equals( 'express', 'express' ) ).toBe( true );
		expect( equals( true, 1 ) ).toBe( false );
	} );

	it( 'treats null as an empty string', () => {
		expect( equals( null, '' ) ).toBe( true );
	} );
} );

describe( 'compare', () => {
	it( 'compares numbers numerically', () => {
		expect( compare( 5, 2 ) ).toBe( 1 );
		expect( compare( 2, 5 ) ).toBe( -1 );
		expect( compare( 5, 5 ) ).toBe( 0 );
	} );

	it( 'compares a number with a numeric string numerically', () => {
		expect( compare( 10, '9' ) ).toBe( 1 );
	} );

	it( 'compares strings lexicographically', () => {
		expect( compare( '2026-03-01', '2026-01-01' ) ).toBe( 1 );
	} );

	it( 'rejects mixed types', () => {
		try {
			compare( 5, 'express' );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'type_error' );
		}
	} );
} );
```

`tests/js/engine/functions.test.js`:

```js
import { callFunction, hasFunction, roundHalfAwayFromZero } from '../../../frontend-src/engine/functions';

describe( 'hasFunction', () => {
	it( 'registers the built-in set', () => {
		[ 'min', 'max', 'round', 'ceil', 'floor', 'abs', 'sum' ].forEach( ( name ) => {
			expect( hasFunction( name ) ).toBe( true );
		} );

		expect( hasFunction( 'sqrt' ) ).toBe( false );
		expect( hasFunction( 'if' ) ).toBe( false );
	} );
} );

describe( 'roundHalfAwayFromZero', () => {
	it( 'rounds half away from zero, unlike Math.round', () => {
		expect( roundHalfAwayFromZero( 2.5 ) ).toBe( 3 );
		expect( roundHalfAwayFromZero( -2.5 ) ).toBe( -3 );
		expect( Math.round( -2.5 ) ).toBe( -2 );
		expect( roundHalfAwayFromZero( 0.5 ) ).toBe( 1 );
		expect( roundHalfAwayFromZero( 1.5 ) ).toBe( 2 );
		expect( roundHalfAwayFromZero( 0 ) ).toBe( 0 );
	} );

	it( 'compensates for float representation error', () => {
		expect( roundHalfAwayFromZero( 1.005, 2 ) ).toBe( 1.01 );
		expect( roundHalfAwayFromZero( 2.675, 2 ) ).toBe( 2.68 );
		expect( roundHalfAwayFromZero( 1.145, 2 ) ).toBe( 1.15 );
	} );

	it( 'rounds to negative precision', () => {
		expect( roundHalfAwayFromZero( 125, -1 ) ).toBe( 130 );
	} );
} );

describe( 'callFunction', () => {
	it( 'evaluates the built-ins', () => {
		expect( callFunction( 'min', [ 5, 2, 9 ] ) ).toBe( 2 );
		expect( callFunction( 'max', [ 5, 2, 9 ] ) ).toBe( 9 );
		expect( callFunction( 'sum', [ 1, 2, 3, 4 ] ) ).toBe( 10 );
		expect( callFunction( 'sum', [] ) ).toBe( 0 );
		expect( callFunction( 'ceil', [ 2.1 ] ) ).toBe( 3 );
		expect( callFunction( 'floor', [ 2.9 ] ) ).toBe( 2 );
		expect( callFunction( 'abs', [ -4.5 ] ) ).toBe( 4.5 );
		expect( callFunction( 'round', [ 2.5 ] ) ).toBe( 3 );
		expect( callFunction( 'round', [ 2.4567, 2 ] ) ).toBe( 2.46 );
	} );

	it( 'treats an empty argument as zero', () => {
		expect( callFunction( 'abs', [ null ] ) ).toBe( 0 );
		expect( callFunction( 'min', [ '', 5 ] ) ).toBe( 0 );
	} );

	it.each( [
		[ 'abs', [ 1, 2 ], 'wrong_argument_count' ],
		[ 'min', [], 'wrong_argument_count' ],
		[ 'sqrt', [ 4 ], 'unknown_function' ],
	] )( 'rejects %s', ( name, args, codeSlug ) => {
		try {
			callFunction( name, args );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( codeSlug );
		}
	} );
} );
```

- [ ] **Step 2: Testlərin uğursuz olduğunu təsdiqlə**

Run: `npm test -- values functions`
Expected: FAIL — `Cannot find module '../../../frontend-src/engine/values'`.

- [ ] **Step 3: `values.js` yaz**

`frontend-src/engine/values.js`:

```js
import { ExpressionError } from './errors';

// PHP Values::isNumericString() ilə EYNİ regex.
const NUMERIC_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const isNumericString = ( value ) => typeof value === 'string' && NUMERIC_STRING.test( value );

const typeOf = ( value ) => {
	if ( typeof value === 'boolean' ) {
		return 'boolean';
	}

	if ( typeof value === 'number' ) {
		return 'number';
	}

	if ( Array.isArray( value ) ) {
		return 'list';
	}

	return 'string';
};

export function toNumber( value, position = 0 ) {
	if ( value === null || value === undefined || value === '' ) {
		return 0;
	}

	if ( typeof value === 'boolean' ) {
		return value ? 1 : 0;
	}

	if ( typeof value === 'number' ) {
		return value;
	}

	if ( isNumericString( value ) ) {
		return parseFloat( value );
	}

	throw new ExpressionError(
		'type_error',
		'This value cannot be used in a calculation.',
		position,
		{ value: Array.isArray( value ) ? 'list' : String( value ) }
	);
}

export function toBool( value ) {
	if ( value === null || value === undefined || value === '' || value === false ) {
		return false;
	}

	if ( Array.isArray( value ) ) {
		return value.length > 0;
	}

	if ( typeof value === 'number' ) {
		return value !== 0;
	}

	return true;
}

export function isNumericLike( value ) {
	if ( value === null || value === undefined || value === '' || typeof value === 'boolean' ) {
		return true;
	}

	if ( typeof value === 'number' ) {
		return true;
	}

	return isNumericString( value );
}

export function equals( left, right ) {
	const a = left === null || left === undefined ? '' : left;
	const b = right === null || right === undefined ? '' : right;

	const typeA = typeOf( a );
	const typeB = typeOf( b );

	if ( typeA !== typeB ) {
		return false;
	}

	if ( typeA === 'list' ) {
		return a.length === b.length && a.every( ( item, index ) => item === b[ index ] );
	}

	return a === b;
}

export function compare( left, right, position = 0 ) {
	const a = left === null || left === undefined ? '' : left;
	const b = right === null || right === undefined ? '' : right;

	if ( isNumericLike( a ) && isNumericLike( b ) ) {
		const numberA = toNumber( a, position );
		const numberB = toNumber( b, position );

		if ( numberA === numberB ) {
			return 0;
		}

		return numberA < numberB ? -1 : 1;
	}

	if ( typeof a === 'string' && typeof b === 'string' ) {
		if ( a === b ) {
			return 0;
		}

		return a < b ? -1 : 1;
	}

	throw new ExpressionError( 'type_error', 'These two values cannot be compared with each other.', position );
}
```

- [ ] **Step 4: `functions.js` yaz**

`frontend-src/engine/functions.js`:

```js
import { ExpressionError } from './errors';
import { toNumber } from './values';

// PHP Functions::SIGNATURES ilə eyni: [minimum, maksimum və ya null].
const SIGNATURES = {
	min: [ 1, null ],
	max: [ 1, null ],
	sum: [ 0, null ],
	round: [ 1, 2 ],
	ceil: [ 1, 1 ],
	floor: [ 1, 1 ],
	abs: [ 1, 1 ],
};

export function hasFunction( name ) {
	return Object.prototype.hasOwnProperty.call( SIGNATURES, name );
}

/**
 * Yarını sıfırdan uzağa yuvarlaqlaşdırır.
 *
 * PHP Functions::roundHalfAwayFromZero() ilə əməliyyat-əməliyyat eynidir.
 * Math.round() istifadə EDİLMİR: Math.round( -2.5 ) === -2, PHP round( -2.5 ) === -3.
 */
export function roundHalfAwayFromZero( value, precision = 0 ) {
	if ( ! Number.isFinite( value ) ) {
		throw new ExpressionError( 'type_error', 'Cannot round a value that is not a finite number.' );
	}

	const factor = Math.pow( 10, precision );
	const scaled = value * factor;
	const absolute = Math.abs( scaled );
	const epsilon = absolute * 1e-12;
	const rounded = Math.floor( absolute + 0.5 + epsilon );
	const sign = value < 0 ? -1 : 1;

	return ( sign * rounded ) / factor;
}

export function callFunction( name, args, position = 0 ) {
	if ( ! hasFunction( name ) ) {
		throw new ExpressionError( 'unknown_function', `There is no function called "${ name }".`, position, { name } );
	}

	const [ minimum, maximum ] = SIGNATURES[ name ];
	const count = args.length;

	if ( count < minimum || ( maximum !== null && count > maximum ) ) {
		throw new ExpressionError(
			'wrong_argument_count',
			`"${ name }" was given ${ count } argument(s).`,
			position,
			{ name, given: count, min: minimum, max: maximum }
		);
	}

	const numbers = args.map( ( argument ) => toNumber( argument, position ) );

	switch ( name ) {
		case 'min':
			return Math.min( ...numbers );

		case 'max':
			return Math.max( ...numbers );

		case 'sum':
			return numbers.reduce( ( total, current ) => total + current, 0 );

		case 'round':
			return roundHalfAwayFromZero( numbers[ 0 ], numbers.length > 1 ? Math.trunc( numbers[ 1 ] ) : 0 );

		case 'ceil':
			return Math.ceil( numbers[ 0 ] );

		case 'floor':
			return Math.floor( numbers[ 0 ] );

		case 'abs':
			return Math.abs( numbers[ 0 ] );

		default:
			throw new ExpressionError( 'unknown_function', `There is no function called "${ name }".`, position );
	}
}
```

- [ ] **Step 5: Testlərin keçdiyini təsdiqlə**

Run: `npm test -- values functions`
Expected: hər iki fayl PASS.

- [ ] **Step 6: Commit hazırla**

```bash
git add frontend-src/engine/values.js frontend-src/engine/functions.js tests/js/engine/values.test.js tests/js/engine/functions.test.js
git commit -m "feat(engine): add javascript value rules and built-in functions"
```

---
## Task 12: JS Evaluator və `index.js` fasadı

**Files:**
- Create: `frontend-src/engine/evaluator.js`
- Create: `frontend-src/engine/compile.js`
- Create: `frontend-src/engine/index.js`
- Test: `tests/js/engine/evaluator.test.js`

**Interfaces:**
- Consumes: `parse`, `toNumber`, `toBool`, `equals`, `compare`, `callFunction`, `ExpressionError`.
- Produces:
  - `evaluate( node, variables )` (named export, `evaluator.js`).
  - `compile.js` (named export-lar): `compileExpression( source )`, `evaluateExpression( source, variables )`, `expressionVariables( source )`, `clearExpressionCache()`, `expressionCacheSize()`, və yenidən ixrac olunan `ExpressionError`.
  - `index.js` — paket barreli: `compile.js` və (Task 15-dən sonra) `calculations.js` export-larını yenidən ixrac edir, öz məntiqi yoxdur.

**Paritet qeydləri:**
- `if` burada da xüsusi haldır və tənbəl qiymətləndirilir.
- `&&` / `||` qısa dövrəlidir və həmişə boolean qaytarır.
- `%` JS-də float qalıq verir və PHP `fmod()` ilə eyni nəticəlidir (mənfi operandlarda da) — `error-modulo-negative` fixture-u bunu kilidləyir.
- Levenshtein təklifi PHP `levenshtein()` ilə eyni klassik alqoritmdir; təklif mətni paritet fixture-larında yoxlanılmır.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/js/engine/evaluator.test.js`:

```js
import { evaluate } from '../../../frontend-src/engine/evaluator';
import { parse } from '../../../frontend-src/engine/parser';

const run = ( source, variables = {} ) => evaluate( parse( source ), variables );

describe( 'evaluate', () => {
	it( 'respects arithmetic precedence', () => {
		expect( run( '2 + 3 * 4' ) ).toBe( 14 );
		expect( run( '(2 + 3) * 4' ) ).toBe( 20 );
	} );

	it( 'resolves variables', () => {
		expect( run( '{room_count} * 50 + {bathrooms} * 120', { room_count: 3, bathrooms: 2 } ) ).toBe( 390 );
	} );

	it( 'treats an empty variable as zero', () => {
		expect( run( '{room_count} * 50 + {bathrooms} * 120', { room_count: 3, bathrooms: '' } ) ).toBe( 150 );
	} );

	it( 'applies unary operators', () => {
		expect( run( '-{a}', { a: 5 } ) ).toBe( -5 );
		expect( run( '!{a}', { a: 0 } ) ).toBe( true );
		expect( run( '!{a}', { a: 1 } ) ).toBe( false );
	} );

	it( 'takes a float remainder', () => {
		expect( run( '7 % 3' ) ).toBe( 1 );
		expect( run( '7.5 % 3.5' ) ).toBe( 0.5 );
	} );

	it( 'returns booleans from comparisons', () => {
		expect( run( '{a} > 2', { a: 5 } ) ).toBe( true );
		expect( run( '{tier} == "express"', { tier: 'express' } ) ).toBe( true );
		expect( run( '{tier} == 5', { tier: '5' } ) ).toBe( false );
	} );

	it( 'short-circuits logical operators', () => {
		expect( run( '{a} && (1 / 0)', { a: 0 } ) ).toBe( false );
		expect( run( '{a} || (1 / 0)', { a: 1 } ) ).toBe( true );
	} );

	it( 'evaluates only the chosen if branch', () => {
		expect( run( 'if({x} == 0, 0, 100 / {x})', { x: 0 } ) ).toBe( 0 );
		expect( run( 'if({x} == 0, 0, 100 / {x})', { x: 4 } ) ).toBe( 25 );
	} );

	it( 'returns non-numeric if branches', () => {
		expect( run( 'if({a}, "yes", "no")', { a: 1 } ) ).toBe( 'yes' );
	} );

	it( 'rejects if with the wrong argument count', () => {
		try {
			run( 'if(1, 2)' );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( 'wrong_argument_count' );
		}
	} );

	it.each( [
		[ '1 / 0', {}, 'division_by_zero' ],
		[ '1 % 0', {}, 'division_by_zero' ],
		[ '{nope}', { a: 1 }, 'unknown_variable' ],
	] )( 'rejects %s', ( source, variables, codeSlug ) => {
		try {
			run( source, variables );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.codeSlug ).toBe( codeSlug );
		}
	} );

	it( 'suggests a near-miss variable name', () => {
		try {
			run( '{bathroms}', { bathrooms: 2 } );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.context.suggestion ).toBe( 'bathrooms' );
		}
	} );

	it( 'offers no suggestion when nothing is close', () => {
		try {
			run( '{zzzzzzzz}', { bathrooms: 2 } );
			throw new Error( 'Expected ExpressionError.' );
		} catch ( error ) {
			expect( error.context.suggestion ).toBeNull();
		}
	} );

	it( 'evaluates a real-world expression', () => {
		expect(
			run( 'round(if({urgency} == "express", {subtotal} * 1.3, {subtotal}), 2)', {
				urgency: 'express',
				subtotal: 390,
			} )
		).toBe( 507 );
	} );
} );
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `npm test -- evaluator`
Expected: FAIL — `Cannot find module '../../../frontend-src/engine/evaluator'`.

- [ ] **Step 3: `evaluator.js` yaz**

`frontend-src/engine/evaluator.js`:

```js
import { ExpressionError } from './errors';
import { callFunction } from './functions';
import { compare, equals, toBool, toNumber } from './values';

// PHP levenshtein() ilə eyni klassik alqoritm.
function levenshtein( left, right ) {
	if ( left === right ) {
		return 0;
	}

	if ( left.length === 0 ) {
		return right.length;
	}

	if ( right.length === 0 ) {
		return left.length;
	}

	let previous = Array.from( { length: right.length + 1 }, ( _, index ) => index );

	for ( let i = 0; i < left.length; i++ ) {
		const current = [ i + 1 ];

		for ( let j = 0; j < right.length; j++ ) {
			const cost = left[ i ] === right[ j ] ? 0 : 1;

			current.push( Math.min( current[ j ] + 1, previous[ j + 1 ] + 1, previous[ j ] + cost ) );
		}

		previous = current;
	}

	return previous[ right.length ];
}

function suggestVariable( name, variables ) {
	let best = null;
	let bestDistance = Number.MAX_SAFE_INTEGER;

	Object.keys( variables ).forEach( ( candidate ) => {
		const distance = levenshtein( name, candidate );

		if ( distance < bestDistance ) {
			bestDistance = distance;
			best = candidate;
		}
	} );

	const threshold = Math.max( 2, Math.floor( name.length / 3 ) );

	return best !== null && bestDistance <= threshold ? best : null;
}

export function evaluate( node, variables ) {
	switch ( node.type ) {
		case 'number':
		case 'string':
		case 'boolean':
			return node.value;

		case 'var': {
			if ( Object.prototype.hasOwnProperty.call( variables, node.name ) ) {
				return variables[ node.name ];
			}

			throw new ExpressionError(
				'unknown_variable',
				`There is no field or calculation called "${ node.name }".`,
				0,
				{ name: node.name, suggestion: suggestVariable( node.name, variables ) }
			);
		}

		case 'unary': {
			const operand = evaluate( node.operand, variables );

			return node.op === '-' ? -toNumber( operand ) : ! toBool( operand );
		}

		case 'binary':
			return evaluateBinary( node, variables );

		case 'call':
			return evaluateCall( node, variables );

		default:
			throw new ExpressionError( 'unknown_node', `Unsupported expression node "${ node.type }".` );
	}
}

function evaluateBinary( node, variables ) {
	if ( node.op === '&&' ) {
		return toBool( evaluate( node.left, variables ) ) && toBool( evaluate( node.right, variables ) );
	}

	if ( node.op === '||' ) {
		return toBool( evaluate( node.left, variables ) ) || toBool( evaluate( node.right, variables ) );
	}

	const left = evaluate( node.left, variables );
	const right = evaluate( node.right, variables );

	switch ( node.op ) {
		case '==':
			return equals( left, right );

		case '!=':
			return ! equals( left, right );

		case '>':
			return compare( left, right ) > 0;

		case '<':
			return compare( left, right ) < 0;

		case '>=':
			return compare( left, right ) >= 0;

		case '<=':
			return compare( left, right ) <= 0;

		default:
			break;
	}

	const leftNumber = toNumber( left );
	const rightNumber = toNumber( right );

	switch ( node.op ) {
		case '+':
			return leftNumber + rightNumber;

		case '-':
			return leftNumber - rightNumber;

		case '*':
			return leftNumber * rightNumber;

		case '/':
			if ( rightNumber === 0 ) {
				throw new ExpressionError( 'division_by_zero', 'Cannot divide by zero.' );
			}

			return leftNumber / rightNumber;

		case '%':
			if ( rightNumber === 0 ) {
				throw new ExpressionError( 'division_by_zero', 'Cannot take a remainder with zero.' );
			}

			return leftNumber % rightNumber;

		default:
			throw new ExpressionError( 'unknown_operator', `Unsupported operator "${ node.op }".` );
	}
}

function evaluateCall( node, variables ) {
	if ( node.name === 'if' ) {
		if ( node.args.length !== 3 ) {
			throw new ExpressionError(
				'wrong_argument_count',
				`"if" needs exactly 3 arguments, ${ node.args.length } given.`,
				0,
				{ name: 'if', given: node.args.length, min: 3, max: 3 }
			);
		}

		const condition = toBool( evaluate( node.args[ 0 ], variables ) );

		return evaluate( node.args[ condition ? 1 : 2 ], variables );
	}

	return callFunction(
		node.name,
		node.args.map( ( argument ) => evaluate( argument, variables ) )
	);
}
```

- [ ] **Step 4: `compile.js` və `index.js` fasadını yaz**

Keş və kompilyasiya köməkçiləri ayrıca `compile.js` faylındadır, `index.js` isə sadəcə barreldir. Səbəb: Task 15-də `calculations.js` bu köməkçilərə ehtiyac duyur, `index.js` isə `calculations.js`-i yenidən ixrac edir. Hər ikisi `index.js`-dən idxal etsəydi, dövri ES modul asılılığı yaranardı və Babel/CJS interop altında `undefined` import verə bilərdi.

`frontend-src/engine/compile.js`:

```js
import { ExpressionError } from './errors';
import { evaluate } from './evaluator';
import { parse } from './parser';

const cache = new Map();

export function compileExpression( source ) {
	if ( ! cache.has( source ) ) {
		cache.set( source, parse( source ) );
	}

	return cache.get( source );
}

export function evaluateExpression( source, variables ) {
	return evaluate( compileExpression( source ), variables );
}

function collectVariables( node, names ) {
	switch ( node.type ) {
		case 'var':
			names.push( node.name );
			return;

		case 'unary':
			collectVariables( node.operand, names );
			return;

		case 'binary':
			collectVariables( node.left, names );
			collectVariables( node.right, names );
			return;

		case 'call':
			node.args.forEach( ( argument ) => collectVariables( argument, names ) );
			return;

		default:
	}
}

export function expressionVariables( source ) {
	const names = [];

	collectVariables( compileExpression( source ), names );

	return [ ...new Set( names ) ];
}

export function clearExpressionCache() {
	cache.clear();
}

export function expressionCacheSize() {
	return cache.size;
}

export { ExpressionError };
```

`frontend-src/engine/index.js`:

```js
export {
	clearExpressionCache,
	compileExpression,
	evaluateExpression,
	expressionCacheSize,
	expressionVariables,
	ExpressionError,
} from './compile';
```

- [ ] **Step 5: Testlərin keçdiyini təsdiqlə**

Run: `npm test -- evaluator`
Expected: 16 test PASS.

- [ ] **Step 6: Commit hazırla**

```bash
git add frontend-src/engine/evaluator.js frontend-src/engine/index.js tests/js/engine/evaluator.test.js
git commit -m "feat(engine): add javascript evaluator and engine facade"
```

---

## Task 13: Jest paritet icraçısı

Bu task paritet qapısını bağlayır: Task 8-də yaradılmış **eyni JSON faylı** indi JS tərəfdə də icra olunur.

**Files:**
- Test: `tests/js/engine/parity.test.js`

**Interfaces:**
- Consumes: `tests/fixtures/expressions.json` (Task 8-də yaradılıb), `evaluateExpression`, `clearExpressionCache`.
- Produces: heç bir istehsal kodu — yalnız qapı.

- [ ] **Step 1: Paritet testini yaz**

`tests/js/engine/parity.test.js`:

```js
import fixtures from '../../fixtures/expressions.json';
import { clearExpressionCache, evaluateExpression } from '../../../frontend-src/engine';

describe( 'expression parity fixtures', () => {
	it( 'has unique case ids', () => {
		const ids = fixtures.cases.map( ( testCase ) => testCase.id );

		expect( new Set( ids ).size ).toBe( ids.length );
	} );

	it( 'declares exactly one of expect or error per case', () => {
		fixtures.cases.forEach( ( testCase ) => {
			const hasExpect = Object.prototype.hasOwnProperty.call( testCase, 'expect' );
			const hasError = Object.prototype.hasOwnProperty.call( testCase, 'error' );

			expect( hasExpect !== hasError ).toBe( true );
		} );
	} );

	describe.each( fixtures.cases.map( ( testCase ) => [ testCase.id, testCase ] ) )( '%s', ( id, testCase ) => {
		beforeEach( () => {
			clearExpressionCache();
		} );

		it( 'matches the shared fixture', () => {
			if ( Object.prototype.hasOwnProperty.call( testCase, 'error' ) ) {
				try {
					evaluateExpression( testCase.expr, testCase.vars );
					throw new Error( `Case "${ id }" should have raised "${ testCase.error }".` );
				} catch ( error ) {
					expect( error.codeSlug ).toBe( testCase.error );
				}

				return;
			}

			const actual = evaluateExpression( testCase.expr, testCase.vars );

			if ( typeof testCase.expect === 'boolean' || typeof testCase.expect === 'string' ) {
				expect( actual ).toBe( testCase.expect );
				return;
			}

			expect( actual ).toBeCloseTo( testCase.expect, 9 );
		} );
	} );
} );
```

- [ ] **Step 2: Jest-in JSON import edə bildiyini təsdiqlə**

Jest `json` modullarını standart olaraq həll edir, ona görə əlavə konfiqurasiya lazım deyil. Test uğursuz olarsa və səbəb JSON həlli olarsa, `jest.config.js`-ə `moduleFileExtensions: [ 'js', 'json' ]` əlavə et.

Run: `npm test -- parity`
Expected: bütün fixture halları PASS.

- [ ] **Step 3: Hər iki tərəfi birlikdə işə sal**

Run: `composer test && npm test`
Expected: hər ikisi PASS, və hər iki tərəf `expressions.json` faylındakı eyni sayda halı icra edir.

- [ ] **Step 4: Paritetin həqiqətən qapı olduğunu təsdiqlə (qəsdən pozma testi)**

`frontend-src/engine/functions.js` faylında `roundHalfAwayFromZero` funksiyasını müvəqqəti olaraq `Math.round( value * factor ) / factor` ilə əvəz et.

Run: `npm test -- parity`
Expected: **FAIL** — `round-half-away-negative` və `round-float-error-1005` halları düşməlidir.

Sonra dəyişikliyi geri qaytar və testin yenidən keçdiyini təsdiqlə.

Run: `npm test -- parity`
Expected: PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add tests/js/engine/parity.test.js
git commit -m "test(engine): run shared parity fixtures from jest"
```

---
## Task 14: PHP hesablama qrafı (`CalculationGraph`)

Spec §7.4: hesablamalar bir-birinə istinad edə bilir (`{subtotal}` → `{total}`), ona görə onlar DAG təşkil edir və topoloji sıra ilə həll olunur. Dövri istinad saxlama anında aşkarlanmalıdır.

**Files:**
- Create: `includes/Engine/CalculationGraph.php`
- Test: `tests/php/Engine/CalculationGraphTest.php`

**Interfaces:**
- Consumes: `Quoteform\Engine\Expression`, `Quoteform\Engine\ExpressionException`.
- Produces: `Quoteform\Engine\CalculationGraph` — statik metodlar:
  - `order( array $calculations ): string[]` — hesablama açarları asılılıq sırası ilə
  - `evaluateAll( array $calculations, array $variables ): array` — `açar => dəyər` map-i

`$calculations` formatı: `[ [ 'key' => 'subtotal', 'expression' => '{a} * 2' ], ... ]` (sxemdəki `calculations` massivinin eynisi).

**Qaydalar:**
- Təkrarlanan açar → `duplicate_calculation_key`.
- Dövri istinad → `circular_reference`, `context['cycle']` dövrənin açar yolunu daşıyır.
- Hesablanmış dəyər eyni adlı sahə dəyərini **üstələyir** (hesablama sonra icra olunur).
- Sahələrə istinad qrafa daxil deyil — yalnız hesablama açarları arasındakı asılılıqlar sıralamaya təsir edir.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Engine/CalculationGraphTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\CalculationGraph;
use Quoteform\Engine\ExpressionException;

final class CalculationGraphTest extends TestCase
{
    public function testOrdersDependenciesBeforeDependents(): void
    {
        $calculations = [
            [ 'key' => 'total', 'expression' => '{subtotal} + 10' ],
            [ 'key' => 'subtotal', 'expression' => '{a} * 2' ],
        ];

        $this->assertSame( [ 'subtotal', 'total' ], CalculationGraph::order( $calculations ) );
    }

    public function testKeepsDeclarationOrderWhenIndependent(): void
    {
        $calculations = [
            [ 'key' => 'b', 'expression' => '2' ],
            [ 'key' => 'a', 'expression' => '1' ],
        ];

        $this->assertSame( [ 'b', 'a' ], CalculationGraph::order( $calculations ) );
    }

    public function testOrdersThreeLevelChain(): void
    {
        $calculations = [
            [ 'key' => 'total', 'expression' => '{withTax} + {fee}' ],
            [ 'key' => 'withTax', 'expression' => '{subtotal} * 1.2' ],
            [ 'key' => 'fee', 'expression' => '5' ],
            [ 'key' => 'subtotal', 'expression' => '{a} * 2' ],
        ];

        $order = CalculationGraph::order( $calculations );

        $this->assertLessThan( array_search( 'withTax', $order, true ), array_search( 'subtotal', $order, true ) );
        $this->assertLessThan( array_search( 'total', $order, true ), array_search( 'withTax', $order, true ) );
        $this->assertLessThan( array_search( 'total', $order, true ), array_search( 'fee', $order, true ) );
    }

    public function testEvaluatesChainedCalculations(): void
    {
        $calculations = [
            [ 'key' => 'subtotal', 'expression' => '{a} * 2' ],
            [ 'key' => 'total', 'expression' => '{subtotal} + 10' ],
        ];

        $this->assertSame(
            [ 'subtotal' => 10.0, 'total' => 20.0 ],
            CalculationGraph::evaluateAll( $calculations, [ 'a' => 5.0 ] )
        );
    }

    public function testEvaluatesOutOfOrderDeclarations(): void
    {
        $calculations = [
            [ 'key' => 'total', 'expression' => '{subtotal} + 10' ],
            [ 'key' => 'subtotal', 'expression' => '{a} * 2' ],
        ];

        $result = CalculationGraph::evaluateAll( $calculations, [ 'a' => 5.0 ] );

        $this->assertSame( 20.0, $result['total'] );
    }

    public function testCalculationOverridesFieldOfTheSameName(): void
    {
        $calculations = [
            [ 'key' => 'total', 'expression' => '99' ],
            [ 'key' => 'doubled', 'expression' => '{total} * 2' ],
        ];

        $result = CalculationGraph::evaluateAll( $calculations, [ 'total' => 5.0 ] );

        $this->assertSame( 99.0, $result['total'] );
        $this->assertSame( 198.0, $result['doubled'] );
    }

    public function testDetectsDirectCycle(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b}' ],
            [ 'key' => 'b', 'expression' => '{a}' ],
        ];

        try {
            CalculationGraph::order( $calculations );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'circular_reference', $exception->getCodeSlug() );
            $this->assertNotEmpty( $exception->getContext()['cycle'] );
        }
    }

    public function testDetectsSelfReference(): void
    {
        $calculations = [ [ 'key' => 'a', 'expression' => '{a} + 1' ] ];

        try {
            CalculationGraph::order( $calculations );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'circular_reference', $exception->getCodeSlug() );
        }
    }

    public function testDetectsIndirectCycle(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b}' ],
            [ 'key' => 'b', 'expression' => '{c}' ],
            [ 'key' => 'c', 'expression' => '{a}' ],
        ];

        try {
            CalculationGraph::order( $calculations );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'circular_reference', $exception->getCodeSlug() );
        }
    }

    public function testRejectsDuplicateKeys(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '1' ],
            [ 'key' => 'a', 'expression' => '2' ],
        ];

        try {
            CalculationGraph::order( $calculations );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'duplicate_calculation_key', $exception->getCodeSlug() );
        }
    }

    public function testEvaluatesEmptyCalculationList(): void
    {
        $this->assertSame( [], CalculationGraph::evaluateAll( [], [ 'a' => 1.0 ] ) );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `composer test -- --filter CalculationGraphTest`
Expected: FAIL — `Class "Quoteform\Engine\CalculationGraph" not found`.

- [ ] **Step 3: `CalculationGraph` sinfini yaz**

`includes/Engine/CalculationGraph.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Engine;

final class CalculationGraph
{
    /**
     * @param array<int, array{key: string, expression: string}> $calculations
     * @return string[]
     */
    public static function order( array $calculations ): array
    {
        $expressions = [];

        foreach ( $calculations as $calculation ) {
            $key = $calculation['key'];

            if ( isset( $expressions[ $key ] ) ) {
                throw new ExpressionException(
                    'duplicate_calculation_key',
                    sprintf( 'There is more than one calculation called "%s".', $key ),
                    0,
                    [ 'key' => $key ]
                );
            }

            $expressions[ $key ] = $calculation['expression'];
        }

        $dependencies = [];

        foreach ( $expressions as $key => $expression ) {
            $dependencies[ $key ] = array_values(
                array_intersect( Expression::variables( $expression ), array_keys( $expressions ) )
            );
        }

        $ordered = [];
        $state   = [];

        foreach ( array_keys( $expressions ) as $key ) {
            self::visit( $key, $dependencies, $state, $ordered, [] );
        }

        return $ordered;
    }

    /**
     * @param array<int, array{key: string, expression: string}> $calculations
     * @param array<string, mixed>                               $variables
     * @return array<string, mixed>
     */
    public static function evaluateAll( array $calculations, array $variables ): array
    {
        $expressions = [];

        foreach ( $calculations as $calculation ) {
            $expressions[ $calculation['key'] ] = $calculation['expression'];
        }

        $results = [];

        foreach ( self::order( $calculations ) as $key ) {
            $value = Expression::evaluate( $expressions[ $key ], $results + $variables );

            $results[ $key ] = $value;
        }

        return $results;
    }

    /**
     * @param array<string, string[]> $dependencies
     * @param array<string, string>   $state
     * @param string[]                $ordered
     * @param string[]                $path
     */
    private static function visit( string $key, array $dependencies, array &$state, array &$ordered, array $path ): void
    {
        $current = $state[ $key ] ?? 'new';

        if ( $current === 'done' ) {
            return;
        }

        if ( $current === 'visiting' ) {
            $path[] = $key;

            throw new ExpressionException(
                'circular_reference',
                sprintf( 'The calculations reference each other in a loop: %s.', implode( ' → ', $path ) ),
                0,
                [ 'cycle' => $path ]
            );
        }

        $state[ $key ] = 'visiting';
        $path[]        = $key;

        foreach ( $dependencies[ $key ] as $dependency ) {
            self::visit( $dependency, $dependencies, $state, $ordered, $path );
        }

        $state[ $key ] = 'done';
        $ordered[]     = $key;
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `composer test -- --filter CalculationGraphTest`
Expected: 11 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Engine/CalculationGraph.php tests/php/Engine/CalculationGraphTest.php
git commit -m "feat(engine): add calculation dependency graph with cycle detection"
```

---
## Task 15: JS hesablama qrafı və hesablama paritet qapısı

**Files:**
- Create: `frontend-src/engine/calculations.js`
- Modify: `frontend-src/engine/index.js` (yeni export-ların əlavə edilməsi)
- Create: `tests/fixtures/calculations.json`
- Test: `tests/js/engine/calculations.test.js`
- Test: `tests/php/Engine/CalculationParityTest.php`
- Test: `tests/js/engine/calculations-parity.test.js`

**Interfaces:**
- Consumes: `compileExpression`, `evaluateExpression`, `expressionVariables`, `ExpressionError`.
- Produces (named export, `calculations.js`): `orderCalculations( calculations )`, `evaluateAllCalculations( calculations, variables )`. Hər ikisi `index.js`-dən də yenidən ixrac olunur.

**Paritet qeydi:** JS tərəfdə açar sırasını qorumaq üçün `Map` istifadə olunur — adi obyektdə rəqəmə oxşayan açarlar (`"1"`) yenidən sıralanır və bu, PHP-dən fərqli nəticə verər.

- [ ] **Step 1: Ortaq fixture faylını yarat**

`tests/fixtures/calculations.json`:

```json
{
  "version": 1,
  "cases": [
    {
      "id": "single-calculation",
      "calculations": [ { "key": "total", "expression": "{a} * 2" } ],
      "vars": { "a": 5 },
      "expect": { "total": 10 }
    },
    {
      "id": "chained-in-order",
      "calculations": [
        { "key": "subtotal", "expression": "{a} * 2" },
        { "key": "total", "expression": "{subtotal} + 10" }
      ],
      "vars": { "a": 5 },
      "expect": { "subtotal": 10, "total": 20 }
    },
    {
      "id": "chained-out-of-order",
      "calculations": [
        { "key": "total", "expression": "{subtotal} + 10" },
        { "key": "subtotal", "expression": "{a} * 2" }
      ],
      "vars": { "a": 5 },
      "expect": { "subtotal": 10, "total": 20 }
    },
    {
      "id": "three-level-chain",
      "calculations": [
        { "key": "total", "expression": "round({withTax} + {fee}, 2)" },
        { "key": "withTax", "expression": "{subtotal} * 1.2" },
        { "key": "fee", "expression": "5" },
        { "key": "subtotal", "expression": "{rooms} * 50" }
      ],
      "vars": { "rooms": 3 },
      "expect": { "subtotal": 150, "withTax": 180, "fee": 5, "total": 185 }
    },
    {
      "id": "calculation-overrides-field-of-same-name",
      "calculations": [
        { "key": "total", "expression": "99" },
        { "key": "doubled", "expression": "{total} * 2" }
      ],
      "vars": { "total": 5 },
      "expect": { "total": 99, "doubled": 198 }
    },
    {
      "id": "conditional-surcharge",
      "calculations": [
        { "key": "subtotal", "expression": "{rooms} * 50 + {bathrooms} * 120" },
        { "key": "total", "expression": "round(if({urgency} == \"express\", {subtotal} * 1.3, {subtotal}), 2)" }
      ],
      "vars": { "rooms": 3, "bathrooms": 2, "urgency": "express" },
      "expect": { "subtotal": 390, "total": 507 }
    },
    {
      "id": "hidden-field-counts-as-zero",
      "calculations": [ { "key": "total", "expression": "{rooms} * 50 + {extra} * 100" } ],
      "vars": { "rooms": 2, "extra": "" },
      "expect": { "total": 100 }
    },
    {
      "id": "empty-calculation-list",
      "calculations": [],
      "vars": { "a": 1 },
      "expect": {}
    },
    {
      "id": "error-direct-cycle",
      "calculations": [
        { "key": "a", "expression": "{b}" },
        { "key": "b", "expression": "{a}" }
      ],
      "vars": {},
      "error": "circular_reference"
    },
    {
      "id": "error-self-reference",
      "calculations": [ { "key": "a", "expression": "{a} + 1" } ],
      "vars": {},
      "error": "circular_reference"
    },
    {
      "id": "error-indirect-cycle",
      "calculations": [
        { "key": "a", "expression": "{b}" },
        { "key": "b", "expression": "{c}" },
        { "key": "c", "expression": "{a}" }
      ],
      "vars": {},
      "error": "circular_reference"
    },
    {
      "id": "error-duplicate-key",
      "calculations": [
        { "key": "a", "expression": "1" },
        { "key": "a", "expression": "2" }
      ],
      "vars": {},
      "error": "duplicate_calculation_key"
    },
    {
      "id": "error-unknown-variable-in-calculation",
      "calculations": [ { "key": "total", "expression": "{nope} * 2" } ],
      "vars": { "a": 1 },
      "error": "unknown_variable"
    }
  ]
}
```

- [ ] **Step 2: `calculations.js` yaz**

`frontend-src/engine/calculations.js`:

```js
import { ExpressionError } from './errors';
import { evaluateExpression, expressionVariables } from './compile';

function buildExpressionMap( calculations ) {
	// PHP tərəfi ilə eyni sıra üçün Map: adi obyekt rəqəmə oxşayan açarları yenidən sıralayır.
	const expressions = new Map();

	calculations.forEach( ( calculation ) => {
		if ( expressions.has( calculation.key ) ) {
			throw new ExpressionError(
				'duplicate_calculation_key',
				`There is more than one calculation called "${ calculation.key }".`,
				0,
				{ key: calculation.key }
			);
		}

		expressions.set( calculation.key, calculation.expression );
	} );

	return expressions;
}

export function orderCalculations( calculations ) {
	const expressions = buildExpressionMap( calculations );
	const keys = [ ...expressions.keys() ];

	const dependencies = new Map();

	expressions.forEach( ( expression, key ) => {
		dependencies.set(
			key,
			expressionVariables( expression ).filter( ( name ) => expressions.has( name ) )
		);
	} );

	const ordered = [];
	const state = new Map();

	const visit = ( key, path ) => {
		const current = state.get( key ) || 'new';

		if ( current === 'done' ) {
			return;
		}

		if ( current === 'visiting' ) {
			const cycle = [ ...path, key ];

			throw new ExpressionError(
				'circular_reference',
				`The calculations reference each other in a loop: ${ cycle.join( ' → ' ) }.`,
				0,
				{ cycle }
			);
		}

		state.set( key, 'visiting' );
		const nextPath = [ ...path, key ];

		dependencies.get( key ).forEach( ( dependency ) => visit( dependency, nextPath ) );

		state.set( key, 'done' );
		ordered.push( key );
	};

	keys.forEach( ( key ) => visit( key, [] ) );

	return ordered;
}

export function evaluateAllCalculations( calculations, variables ) {
	const expressions = buildExpressionMap( calculations );
	const results = {};

	orderCalculations( calculations ).forEach( ( key ) => {
		results[ key ] = evaluateExpression( expressions.get( key ), { ...variables, ...results } );
	} );

	return results;
}
```

- [ ] **Step 3: `index.js`-ə yeni export-ları əlavə et**

`frontend-src/engine/index.js` faylının **sonuna** əlavə et:

```js
export { evaluateAllCalculations, orderCalculations } from './calculations';
```

- [ ] **Step 4: JS vahid testini yaz**

`tests/js/engine/calculations.test.js`:

```js
import { evaluateAllCalculations, orderCalculations } from '../../../frontend-src/engine/calculations';

describe( 'orderCalculations', () => {
	it( 'orders dependencies before dependents', () => {
		expect(
			orderCalculations( [
				{ key: 'total', expression: '{subtotal} + 10' },
				{ key: 'subtotal', expression: '{a} * 2' },
			] )
		).toEqual( [ 'subtotal', 'total' ] );
	} );

	it( 'keeps declaration order when calculations are independent', () => {
		expect(
			orderCalculations( [
				{ key: 'b', expression: '2' },
				{ key: 'a', expression: '1' },
			] )
		).toEqual( [ 'b', 'a' ] );
	} );
} );

describe( 'evaluateAllCalculations', () => {
	it( 'evaluates a chain', () => {
		expect(
			evaluateAllCalculations(
				[
					{ key: 'subtotal', expression: '{a} * 2' },
					{ key: 'total', expression: '{subtotal} + 10' },
				],
				{ a: 5 }
			)
		).toEqual( { subtotal: 10, total: 20 } );
	} );

	it( 'lets a calculation override a field of the same name', () => {
		const result = evaluateAllCalculations(
			[
				{ key: 'total', expression: '99' },
				{ key: 'doubled', expression: '{total} * 2' },
			],
			{ total: 5 }
		);

		expect( result ).toEqual( { total: 99, doubled: 198 } );
	} );
} );
```

- [ ] **Step 5: Hər iki paritet icraçısını yaz**

`tests/php/Engine/CalculationParityTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\CalculationGraph;
use Quoteform\Engine\Expression;
use Quoteform\Engine\ExpressionException;

/**
 * tests/fixtures/calculations.json faylını oxuyur.
 * Eyni fayl Jest tərəfindən də oxunur (tests/js/engine/calculations-parity.test.js).
 */
final class CalculationParityTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function caseProvider(): array
    {
        $path    = __DIR__ . '/../../fixtures/calculations.json';
        $decoded = json_decode( (string) file_get_contents( $path ), true );

        if ( ! is_array( $decoded ) || ! isset( $decoded['cases'] ) ) {
            throw new \RuntimeException( 'Fixture file is malformed: ' . $path );
        }

        $provided = [];

        foreach ( $decoded['cases'] as $case ) {
            $provided[ $case['id'] ] = [ $case ];
        }

        return $provided;
    }

    /**
     * @dataProvider caseProvider
     * @param array<string, mixed> $case
     */
    public function testFixtureCase( array $case ): void
    {
        Expression::clearCache();

        if ( array_key_exists( 'error', $case ) ) {
            try {
                CalculationGraph::evaluateAll( $case['calculations'], $case['vars'] );
                $this->fail( sprintf( 'Case "%s" should have raised "%s".', $case['id'], $case['error'] ) );
            } catch ( ExpressionException $exception ) {
                $this->assertSame( $case['error'], $exception->getCodeSlug(), $case['id'] );
            }

            return;
        }

        $actual = CalculationGraph::evaluateAll( $case['calculations'], $case['vars'] );

        foreach ( $case['expect'] as $key => $expected ) {
            $this->assertArrayHasKey( $key, $actual, $case['id'] );

            if ( is_bool( $expected ) || is_string( $expected ) ) {
                $this->assertSame( $expected, $actual[ $key ], $case['id'] . '.' . $key );
                continue;
            }

            $this->assertTrue(
                is_int( $actual[ $key ] ) || is_float( $actual[ $key ] ),
                sprintf( 'Case "%s" key "%s" expected a number but the engine returned %s.', $case['id'], $key, gettype( $actual[ $key ] ) )
            );

            $this->assertEqualsWithDelta( (float) $expected, (float) $actual[ $key ], 1e-9, $case['id'] . '.' . $key );
        }

        $this->assertCount( count( $case['expect'] ), $actual, $case['id'] . ' produced extra keys' );
    }
}
```

`tests/js/engine/calculations-parity.test.js`:

```js
import fixtures from '../../fixtures/calculations.json';
import { clearExpressionCache } from '../../../frontend-src/engine';
import { evaluateAllCalculations } from '../../../frontend-src/engine/calculations';

describe( 'calculation parity fixtures', () => {
	it( 'has unique case ids', () => {
		const ids = fixtures.cases.map( ( testCase ) => testCase.id );

		expect( new Set( ids ).size ).toBe( ids.length );
	} );

	describe.each( fixtures.cases.map( ( testCase ) => [ testCase.id, testCase ] ) )( '%s', ( id, testCase ) => {
		beforeEach( () => {
			clearExpressionCache();
		} );

		it( 'matches the shared fixture', () => {
			if ( Object.prototype.hasOwnProperty.call( testCase, 'error' ) ) {
				try {
					evaluateAllCalculations( testCase.calculations, testCase.vars );
					throw new Error( `Case "${ id }" should have raised "${ testCase.error }".` );
				} catch ( error ) {
					expect( error.codeSlug ).toBe( testCase.error );
				}

				return;
			}

			const actual = evaluateAllCalculations( testCase.calculations, testCase.vars );

			expect( Object.keys( actual ).sort() ).toEqual( Object.keys( testCase.expect ).sort() );

			Object.entries( testCase.expect ).forEach( ( [ key, expected ] ) => {
				if ( typeof expected === 'boolean' || typeof expected === 'string' ) {
					expect( actual[ key ] ).toBe( expected );
					return;
				}

				expect( actual[ key ] ).toBeCloseTo( expected, 9 );
			} );
		} );
	} );
} );
```

- [ ] **Step 6: Bütün testləri işə sal**

Run: `composer test && npm test`
Expected: hər ikisi tam PASS.

- [ ] **Step 7: Commit hazırla**

```bash
git add frontend-src/engine/calculations.js frontend-src/engine/index.js tests/fixtures/calculations.json tests/js/engine/calculations.test.js tests/js/engine/calculations-parity.test.js tests/php/Engine/CalculationParityTest.php
git commit -m "feat(engine): add calculation graph in javascript with shared parity fixtures"
```

---

## Planın Sonu — Nə Alındı

Bu plan tamamlandıqda mövcud olan:

- PHP və JS-də eyni nəticə verən, `eval()` istifadə etməyən ifadə mühərriki
- 76 ifadə + 13 hesablama paritet halı, hər ikisi iki dildə icra olunur
- Dövri istinadı saxlama anında tutan hesablama qrafı
- WordPress-dən tam asılı olmayan, izolyasiya ilə test edilə bilən `Engine/` təbəqəsi

**Növbəti plan (02 — Schema & Builder):** CPT `quoteform`, sxem validasiyası (bu planın `CalculationGraph`-ını saxlama vaxtı yoxlaması üçün istifadə edir), REST endpoint-ləri, React builder.
