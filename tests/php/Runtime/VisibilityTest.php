<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Expression;
use Quoteform\Runtime\Conditions;
use Quoteform\Runtime\Visibility;

final class VisibilityTest extends TestCase
{
    protected function setUp(): void
    {
        Expression::clearCache();
    }

    private function schema( array $rules ): array
    {
        return [
            'fields' => [
                'kind'  => [ 'key' => 'kind', 'type' => 'select', 'required' => false, 'options' => [ [ 'value' => 'home' ], [ 'value' => 'office' ] ] ],
                'floor' => [ 'key' => 'floor', 'type' => 'number', 'required' => true ],
                'extras' => [ 'key' => 'extras', 'type' => 'checkbox', 'options' => [ [ 'value' => 'oven' ] ] ],
            ],
            'steps'  => [
                [ 'key' => 'one', 'fields' => [ 'kind', 'extras' ] ],
                [ 'key' => 'two', 'fields' => [ 'floor' ] ],
            ],
            'rules'  => $rules,
        ];
    }

    public function testEveryOperatorAgreesWithTheEngine(): void
    {
        $variables = [ 'n' => 5.0, 'list' => [ 'oven' ], 's' => '' ];
        $schema    = [ 'fields' => [ 'n' => [ 'type' => 'number' ], 'list' => [ 'type' => 'checkbox' ], 's' => [ 'type' => 'text' ] ] ];
        $holds     = static function ( string $field, string $operator, $value = null ) use ( $variables, $schema ): bool {
            $condition = [ 'field' => $field, 'operator' => $operator ];

            if ( func_num_args() > 2 ) {
                $condition['value'] = $value;
            }

            return Conditions::holds( $condition, $variables, $schema );
        };

        $this->assertTrue( $holds( 'n', 'equals', 5 ) );
        $this->assertTrue( $holds( 'n', 'not_equals', 4 ) );
        $this->assertTrue( $holds( 'n', 'greater', 4 ) );
        $this->assertTrue( $holds( 'n', 'greater_or_equal', 5 ) );
        $this->assertTrue( $holds( 'n', 'less', 6 ) );
        $this->assertTrue( $holds( 'n', 'less_or_equal', 5 ) );
        $this->assertTrue( $holds( 'list', 'contains', 'oven' ) );
        $this->assertTrue( $holds( 'list', 'not_contains', 'sauna' ) );
        $this->assertTrue( $holds( 's', 'is_empty' ) );
        $this->assertFalse( $holds( 's', 'is_not_empty' ) );
    }

    public function testABrokenConditionIsFalseNotAnError(): void
    {
        $this->assertFalse( Conditions::holds( [ 'field' => 'ghost', 'operator' => 'equals', 'value' => 1 ], [], [ 'fields' => [] ] ) );
        $this->assertFalse( Conditions::holds( [ 'field' => 'n', 'operator' => 'nonsense', 'value' => 1 ], [ 'n' => 1 ], [ 'fields' => [] ] ) );
    }

    public function testARuleWithoutConditionsNeverFires(): void
    {
        $this->assertFalse( Conditions::ruleFires( [ 'match' => 'all', 'conditions' => [] ], [], [ 'fields' => [] ] ) );
    }

    public function testAnyAndAll(): void
    {
        $true  = [ 'field' => 'n', 'operator' => 'equals', 'value' => 1 ];
        $false = [ 'field' => 'n', 'operator' => 'equals', 'value' => 2 ];
        $vars  = [ 'n' => 1.0 ];
        $s     = [ 'fields' => [ 'n' => [ 'type' => 'number' ] ] ];

        $this->assertTrue( Conditions::ruleFires( [ 'match' => 'any', 'conditions' => [ $false, $true ] ], $vars, $s ) );
        $this->assertFalse( Conditions::ruleFires( [ 'match' => 'all', 'conditions' => [ $false, $true ] ], $vars, $s ) );
    }

    public function testAHiddenStepTakesItsFieldsAndTheirRequirementWithIt(): void
    {
        $rules = [ [ 'target' => [ 'kind' => 'step', 'key' => 'two' ], 'action' => 'hide', 'match' => 'all', 'conditions' => [ [ 'field' => 'kind', 'operator' => 'equals', 'value' => 'home' ] ] ] ];

        $resolved = Visibility::resolve( $this->schema( $rules ), [ 'kind' => 'home', 'floor' => '', 'extras' => [] ] );

        $this->assertSame( [ 'kind' => true, 'extras' => true ], $resolved['fields'] );
        $this->assertSame( [ 'one' => true ], $resolved['steps'] );
        $this->assertSame( [], $resolved['required'] );
    }

    public function testRulesAboutUnknownTargetsAreIgnored(): void
    {
        $rules = [ [ 'target' => [ 'kind' => 'field', 'key' => 'ghost' ], 'action' => 'hide', 'match' => 'all', 'conditions' => [ [ 'field' => 'kind', 'operator' => 'equals', 'value' => 'home' ] ] ] ];

        $resolved = Visibility::resolve( $this->schema( $rules ), [ 'kind' => 'home' ] );

        $this->assertArrayNotHasKey( 'ghost', $resolved['fields'] );
        $this->assertCount( 3, $resolved['fields'] );
    }

    // --- Ruling R3: pozulmuş şərt/qayda datası (Fix round 1) -------------------

    /**
     * Input 1: condition.field mövcuddur, sətir deyil (məs. massiv).
     * JS `template.replace('%s', field)` onu stringə çevirib qiymətləndirirdi
     * (doğru ola bilərdi); PHP əvvəllər 'undefined' əvəz edirdi (yalan). R3-dən
     * sonra hər ikisi HEÇ qiymətləndirmədən false qaytarır.
     */
    public function testR3NonStringConditionFieldNeverHolds(): void
    {
        $condition = [ 'field' => [ 'a' ], 'operator' => 'equals', 'value' => 1 ];

        $this->assertFalse( Conditions::holds( $condition, [ 'a' => 1 ], [ 'fields' => [] ] ) );

        // Köhnə kod 'undefined' əvəz edirdi: əgər `$variables` təsadüfən 'undefined'
        // açarını daşıyırdısa, ifadə ONUN üzərində qiymətləndirilir və true qaytara
        // bilərdi. Bu, dəyişikliyin PHP-də də real davranış fərqi yaratdığını göstərir
        // (sadəcə şərh düzəlişi deyil).
        $condition2 = [ 'field' => [ 'a' ], 'operator' => 'equals', 'value' => 5 ];

        $this->assertFalse( Conditions::holds( $condition2, [ 'undefined' => 5 ], [ 'fields' => [] ] ) );
    }

    /**
     * Input 2: rule.conditions içində obyekt olmayan element (məs. null).
     * JS-də köhnə kod TypeError atırdı (canlı forma çökərdi); PHP artıq
     * `is_array($condition)` yoxlaması ilə false qaytarır — bu davranış R3-ün
     * gözlədiyi ilə üst-üstə düşür, dəyişməyib, lakin explicit test yoxdur idi.
     */
    public function testR3NonObjectConditionEntryIsFalseNotFatal(): void
    {
        $rule = [
            'match'      => 'all',
            'conditions' => [ null, [ 'field' => 'a', 'operator' => 'equals', 'value' => 1 ] ],
        ];

        $this->assertFalse( Conditions::ruleFires( $rule, [ 'a' => 1 ], [ 'fields' => [] ] ) );
    }

    /**
     * Input 3: rule.target.key sətir deyil (məs. rəqəm). JS onu axtarış üçün
     * stringə çevirirdi; PHP artıq (bu düzəlişdən əvvəl də) `is_string($key)`
     * yoxlaması ilə qaydanı keçirdi — R3 JS-i PHP-yə uyğunlaşdırdı.
     */
    public function testR3RuleWithNonStringTargetKeyIsSkipped(): void
    {
        $rules = [
            [
                'target'     => [ 'kind' => 'field', 'key' => 5 ],
                'action'     => 'hide',
                'match'      => 'any',
                'conditions' => [ [ 'field' => 'kind', 'operator' => 'equals', 'value' => 'home' ] ],
            ],
        ];

        $resolved = Visibility::resolve( $this->schema( $rules ), [ 'kind' => 'home', 'floor' => '', 'extras' => [] ] );

        $this->assertArrayHasKey( 'kind', $resolved['fields'] );
        $this->assertCount( 3, $resolved['fields'] );
    }

    /**
     * Input 4: hədəf sahənin tərifi `null`-dur. JS-in köhnə `hasOwnProperty`
     * yoxlaması onu "mövcuddur" sayırdı; PHP-nin `isset()`-i onsuz da "yoxdur"
     * deyirdi (`isset()` `null` dəyər üçün false qaytarır). R3 hər ikisini
     * "yalnız `null`-dan fərqli massivdirsə mövcuddur" qaydasına gətirdi.
     *
     * `Visibility::targetExists()` private-dir; onu Reflection ilə birbaşa
     * sınayırıq, çünki `Visibility::resolve()` vasitəsilə tam pipeline-i
     * işlətmək eyni (divergensiya OLMAYAN) səbəbdən hər iki dildə çökür:
     * `Values::normalise()`/`Values::emptyFor()` `array $field` tələb edir,
     * `null` verilsə `TypeError` atır (əl ilə yoxlanılıb, docker php:8.2-cli:
     * "Values::normalise(): Argument #1 ($field) must be of type array,
     * null given"). Bu, hər iki mühərrikin EYNİ cür çökdüyü, R3-ün hədəfi
     * olmayan ayrı bir tapıntıdır (bax report, "Fix round 1").
     */
    public function testR3NullFieldDefinitionIsNotATarget(): void
    {
        $schema = [ 'fields' => [ 'a' => null ], 'steps' => [] ];

        $method = new \ReflectionMethod( Visibility::class, 'targetExists' );
        $method->setAccessible( true );

        $this->assertFalse( $method->invoke( null, $schema, true, 'a' ) );
    }
}
