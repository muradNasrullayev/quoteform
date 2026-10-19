<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sxemin bütövlükdə validasiyası.
 *
 * Alt validatorları çağırır və onların nisbi yollarını mütləq yola çevirir
 * (`decimals` → `settings.decimals`), ona görə builder xətanı düzgün
 * sahənin yanında göstərə bilir.
 */
final class SchemaValidator
{
    public const CURRENT_VERSION = 1;

    private const TOP_LEVEL_KEYS = [ 'version', 'settings', 'steps', 'fields', 'calculations', 'rules', 'notifications' ];

    /**
     * @param mixed $schema
     */
    public function validate( $schema ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $schema ) ) {
            $result->addError( '', 'invalid_type', __( 'A schema must be an object.', 'quoteform' ) );

            return $result;
        }

        foreach ( array_keys( $schema ) as $present ) {
            if ( ! in_array( $present, self::TOP_LEVEL_KEYS, true ) ) {
                $result->addError( (string) $present, 'unknown_key', __( 'Unknown key in schema.', 'quoteform' ) );
            }
        }

        $hasMissingKey = false;

        foreach ( self::TOP_LEVEL_KEYS as $expected ) {
            if ( ! array_key_exists( $expected, $schema ) ) {
                $hasMissingKey = true;
                $result->addError( $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
            }
        }

        if ( $hasMissingKey ) {
            return $result;
        }

        if ( ! is_int( $schema['version'] ) ) {
            $result->addError( 'version', 'invalid_type', __( 'Schema version must be a whole number.', 'quoteform' ) );

            return $result;
        }

        if ( $schema['version'] !== self::CURRENT_VERSION ) {
            $result->addError(
                'version',
                'invalid_option',
                __( 'Unsupported schema version.', 'quoteform' ),
                [ 'expected' => self::CURRENT_VERSION, 'given' => $schema['version'] ]
            );

            return $result;
        }

        $result->merge( ( new SettingsValidator() )->validate( $schema['settings'] ), 'settings' );

        $fieldKeys  = [];
        $fieldTypes = $this->validateFields( $schema['fields'], $result, $fieldKeys );

        $result->merge( ( new StepValidator() )->validate( $schema['steps'], $fieldKeys ), 'steps' );

        $this->validateFieldPlacement( $schema['steps'], $fieldKeys, $result );

        $result->merge( ( new CalculationValidator() )->validate( $schema['calculations'], $fieldTypes ), 'calculations' );

        $this->validateKeyCollisions( $fieldKeys, $schema['calculations'], $result );

        $stepKeys = $this->collectStepKeys( $schema['steps'] );

        $result->merge( ( new RuleValidator() )->validate( $schema['rules'], $fieldKeys, $stepKeys ), 'rules' );

        $this->validateStepTargetingRuleLoops( $schema['rules'], $schema['steps'], $result );

        if ( ! is_array( $schema['notifications'] ) || ( $schema['notifications'] !== [] && array_keys( $schema['notifications'] ) !== range( 0, count( $schema['notifications'] ) - 1 ) ) ) {
            $result->addError( 'notifications', 'invalid_type', __( 'Notifications must be a list.', 'quoteform' ) );
        }

        return $result;
    }

    /**
     * `$fieldTypes` (açar => tip) yalnız tipi düzgün olan sahələri ehtiva edir —
     * `CalculationValidator` başqa cür işləyə bilməz. Amma sahənin MÖVCUDLUĞU
     * onun açarı ilə müəyyən olunur, tipi ilə yox: `$fieldKeys` (çağıranın
     * verdiyi massivə yazılır) `KeyRules`-dan keçən HƏR açarı ehtiva edir,
     * bədəni səhv formatlı olsa belə — əks halda səhv tipli sahə "mövcud
     * deyil" kimi görünür və `unknown_reference`/`key_collision` yoxlamaları
     * onu səssizcə buraxır.
     *
     * @param mixed    $fields
     * @param string[] $fieldKeys çıxış: `KeyRules`-a uyğun bütün açarlar
     * @return array<string, string> açar => tip
     */
    private function validateFields( $fields, ValidationResult $result, array &$fieldKeys ): array
    {
        $fieldKeys = [];

        if ( ! is_array( $fields ) ) {
            $result->addError( 'fields', 'invalid_type', __( 'Fields must be an object.', 'quoteform' ) );

            return [];
        }

        if ( $fields === [] ) {
            $result->addError( 'fields', 'empty_collection', __( 'A form needs at least one field.', 'quoteform' ) );

            return [];
        }

        if ( array_keys( $fields ) === range( 0, count( $fields ) - 1 ) ) {
            $result->addError( 'fields', 'invalid_type', __( 'Fields must be keyed by field key, not a list.', 'quoteform' ) );

            return [];
        }

        $validator = new FieldValidator();
        $types     = [];

        foreach ( $fields as $key => $field ) {
            $key  = (string) $key;
            $path = 'fields.' . $key;

            if ( ! KeyRules::validate( $key, $path, $result ) ) {
                continue;
            }

            $fieldKeys[] = $key;

            $result->merge( $validator->validate( $key, $field ), $path );

            if ( is_array( $field ) && array_key_exists( 'type', $field ) && is_string( $field['type'] ) ) {
                $types[ $key ] = $field['type'];
            }
        }

        return $types;
    }

    /**
     * Heç bir addıma yerləşdirilməyən sahələri tapır.
     *
     * Bu yoxlama `StepValidator`-da DEYİL, çünki xəta yolu sxem kökünə nisbi
     * olmalıdır (`fields.<key>`). Orada verilsəydi, `steps` prefiksi ilə
     * birləşib mənasız `steps.fields.<key>` yoluna çevrilərdi.
     *
     * Yetim sahə təhlükəlidir: müştəri onu doldura bilmir, amma hesablama ona
     * istinad edə bilər — qiymət səssizcə sıfır komponenti ilə çıxar.
     *
     * @param mixed    $steps
     * @param string[] $fieldKeys
     */
    private function validateFieldPlacement( $steps, array $fieldKeys, ValidationResult $result ): void
    {
        $placed = $this->collectPlacedFields( $steps );

        foreach ( $fieldKeys as $fieldKey ) {
            if ( ! array_key_exists( $fieldKey, $placed ) ) {
                $result->addError(
                    'fields.' . $fieldKey,
                    'unknown_reference',
                    __( 'This field is not placed on any step, so nobody can fill it in.', 'quoteform' ),
                    [ 'field' => $fieldKey ]
                );
            }
        }
    }

    /**
     * @param string[] $fieldKeys
     * @param mixed    $calculations
     */
    private function validateKeyCollisions( array $fieldKeys, $calculations, ValidationResult $result ): void
    {
        if ( ! is_array( $calculations ) ) {
            return;
        }

        foreach ( $calculations as $index => $calculation ) {
            if ( ! is_array( $calculation ) || ! array_key_exists( 'key', $calculation ) || ! is_string( $calculation['key'] ) ) {
                continue;
            }

            if ( in_array( $calculation['key'], $fieldKeys, true ) ) {
                $result->addError(
                    'calculations.' . $index . '.key',
                    'key_collision',
                    __( 'A calculation cannot have the same key as a field.', 'quoteform' ),
                    [ 'key' => $calculation['key'] ]
                );
            }
        }
    }

    /**
     * @param mixed $steps
     * @return string[]
     */
    private function collectStepKeys( $steps ): array
    {
        if ( ! is_array( $steps ) ) {
            return [];
        }

        $keys = [];

        foreach ( $steps as $step ) {
            if ( is_array( $step ) && array_key_exists( 'key', $step ) && is_string( $step['key'] ) ) {
                $keys[] = $step['key'];
            }
        }

        return $keys;
    }

    /**
     * Bir addıma yerləşdirilmiş sahələrin xəritəsini qurur (açar => true).
     *
     * @param mixed $steps
     * @return array<string, true>
     */
    private function collectPlacedFields( $steps ): array
    {
        if ( ! is_array( $steps ) ) {
            return [];
        }

        $placed = [];

        foreach ( $steps as $step ) {
            if ( ! is_array( $step ) || ! array_key_exists( 'fields', $step ) || ! is_array( $step['fields'] ) ) {
                continue;
            }

            foreach ( $step['fields'] as $fieldKey ) {
                if ( is_string( $fieldKey ) ) {
                    $placed[ $fieldKey ] = true;
                }
            }
        }

        return $placed;
    }

    /**
     * Addımı hədəf alan qaydanın öz şərtinin yoxladığı sahə eyni addımda olub-olmadığını yoxlayır.
     *
     * `RuleValidator` sahə-hədəfli qaydalar üçün bu dövrü artıq tutur, amma addım hədəfləri
     * üçün onu söndürür — o, hansı sahənin hansı addımda olduğunu bilmir, cəmi iki düz siyahı
     * alır. Yalnız bu səviyyə həm addımları (sahə siyahıları ilə), həm də qaydaları birlikdə
     * görür, ona görə həlqəni yalnız burada tuta bilərik: addım gizlədiləndə, onu gizlədən
     * şərti yoxlayan sahə də gizlənir, şərt yalan olur, addım yenidən görünür, sonsuz dövrə.
     *
     * @param mixed $rules
     * @param mixed $steps
     */
    private function validateStepTargetingRuleLoops( $rules, $steps, ValidationResult $result ): void
    {
        if ( ! self::isList( $rules ) || ! is_array( $steps ) ) {
            return;
        }

        $stepFields = $this->collectStepFieldSets( $steps );

        foreach ( $rules as $ruleIndex => $rule ) {
            if ( ! is_array( $rule ) || ! array_key_exists( 'target', $rule ) || ! is_array( $rule['target'] ) ) {
                continue;
            }

            $target = $rule['target'];

            if ( ! array_key_exists( 'kind', $target ) || $target['kind'] !== 'step' ) {
                continue;
            }

            if ( ! array_key_exists( 'key', $target ) || ! is_string( $target['key'] ) ) {
                continue;
            }

            $stepKey = $target['key'];

            if ( ! array_key_exists( $stepKey, $stepFields ) ) {
                continue;
            }

            if ( ! array_key_exists( 'conditions', $rule ) || ! self::isList( $rule['conditions'] ) ) {
                continue;
            }

            foreach ( $rule['conditions'] as $conditionIndex => $condition ) {
                if ( ! is_array( $condition ) || ! array_key_exists( 'field', $condition ) || ! is_string( $condition['field'] ) ) {
                    continue;
                }

                if ( array_key_exists( $condition['field'], $stepFields[ $stepKey ] ) ) {
                    $result->addError(
                        'rules.' . $ruleIndex . '.conditions.' . $conditionIndex . '.field',
                        'circular_reference',
                        __( 'A rule cannot test a field that lives on the very step it targets — that would loop forever.', 'quoteform' ),
                        [ 'field' => $condition['field'], 'step' => $stepKey ]
                    );
                }
            }
        }
    }

    /**
     * Hər addım açarını, o addımdakı sahə açarlarının çoxluğuna eyniləşdirir.
     *
     * Açar təkrarlansa (özü artıq `duplicate_key` kimi bildirilir), sahə
     * çoxluqları ÜST-ÜSTƏ yazılmır, BİRLƏŞDİRİLİR — əks halda əvvəlki addımın
     * sahələri itir və dövrü yoxlama onları görə bilmir.
     *
     * @param mixed $steps
     * @return array<string, array<string, true>>
     */
    private function collectStepFieldSets( $steps ): array
    {
        if ( ! is_array( $steps ) ) {
            return [];
        }

        $sets = [];

        foreach ( $steps as $step ) {
            if ( ! is_array( $step ) || ! array_key_exists( 'key', $step ) || ! is_string( $step['key'] ) ) {
                continue;
            }

            $fields = [];

            if ( array_key_exists( 'fields', $step ) && is_array( $step['fields'] ) ) {
                foreach ( $step['fields'] as $fieldKey ) {
                    if ( is_string( $fieldKey ) ) {
                        $fields[ $fieldKey ] = true;
                    }
                }
            }

            $sets[ $step['key'] ] = array_key_exists( $step['key'], $sets )
                ? $sets[ $step['key'] ] + $fields
                : $fields;
        }

        return $sets;
    }

    /**
     * @param mixed $value
     */
    private static function isList( $value ): bool
    {
        return is_array( $value ) && ( $value === [] || array_keys( $value ) === range( 0, count( $value ) - 1 ) );
    }
}
