<?php 
	
/**
 *
 * Override this template by copying it to yourtheme/woocommerce/cart/cart-aside-open.php
 *
 * @author 		Creative Little Dots
 * @package 	WooCommerce/Templates
 * @version     1.0
 */
 
if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}
 
?>

<?php
$config = ( isset( $side_cart_config ) && is_array( $side_cart_config ) ) ? $side_cart_config : array();
$show_floating_icon = true;
if ( isset( $config['ui'] ) && is_array( $config['ui'] ) && isset( $config['ui']['showFloatingCartIcon'] ) ) {
	$show_floating_icon = (bool) $config['ui']['showFloatingCartIcon'];
}

if ( ! $show_floating_icon ) {
	return;
}

$hide_count_when_zero = false;
if ( isset( $config['ui'] ) && is_array( $config['ui'] ) && isset( $config['ui']['hideCountWhenZero'] ) ) {
	$hide_count_when_zero = (bool) $config['ui']['hideCountWhenZero'];
}

$icon_payload = apply_filters( 'wc_side_cart_icon_svg', '', 'floating', $config );
$raw_icon_markup = '';
$disable_icon_validation = false;
if ( is_array( $icon_payload ) ) {
	if ( isset( $icon_payload['html'] ) ) {
		$raw_icon_markup = (string) $icon_payload['html'];
	}
	if ( isset( $icon_payload['disableValidation'] ) ) {
		$disable_icon_validation = (bool) $icon_payload['disableValidation'];
	}
} elseif ( is_string( $icon_payload ) ) {
	$raw_icon_markup = $icon_payload;
}
$svg = WCSC_IconSvgSanitizer::sanitizeMarkup( $raw_icon_markup, $disable_icon_validation );
$has_svg = ( $svg !== '' );

$extra_classes = '';
if ( isset( $config['cssClasses'] ) && is_array( $config['cssClasses'] ) && isset( $config['cssClasses']['floatingIcon'] ) ) {
	$raw = (string) $config['cssClasses']['floatingIcon'];
	$tokens = preg_split( '/\s+/', trim( $raw ) );
	$clean = array();
	if ( is_array( $tokens ) ) {
		foreach ( $tokens as $token ) {
			$token = trim( (string) $token );
			if ( $token === '' ) {
				continue;
			}
			if ( strpos( $token, "\0" ) !== false ) {
				continue;
			}
			if ( preg_match( '/[\s"\'<>]/', $token ) ) {
				continue;
			}
			$clean[] = $token;
		}
	}
	$extra_classes = implode( ' ', $clean );
}

$class_attr = trim( 'js-side-cart-icon js-side-cart-open side-cart__icon side-cart__icon--outer side-cart__icon--mob ' . $extra_classes );
if ( $has_svg ) {
	$class_attr .= ' side-cart__icon--svg';
}

$href = wc_get_cart_url();
if ( isset( $config['parity'] ) && is_array( $config['parity'] ) && isset( $config['parity']['onCartClickBehaviour'] ) ) {
	$behaviour = strtolower( trim( (string) $config['parity']['onCartClickBehaviour'] ) );
	if ( $behaviour === 'navigate_to_checkout' ) {
		$href = function_exists( 'wc_get_checkout_url' ) ? wc_get_checkout_url() : $href;
	}
}
?>

<a
	href="<?php echo esc_url( $href ); ?>"
	class="<?php echo esc_attr( $class_attr ); ?>"
	aria-haspopup="dialog"
	aria-controls="wc-side-cart-panel"
	aria-expanded="false"
>
	<span class="screen-reader-text"><?php echo esc_html__( 'Cart', 'woocommerce' ); ?></span>
	<?php if ( $has_svg ) : ?>
		<span class="side-cart__icon_svg" aria-hidden="true"><?php echo $svg; ?></span>
	<?php endif; ?>

	<?php $count = absint( WC()->cart->cart_contents_count ); ?>
	<span class="side-cart__number js-side-cart-number" <?php echo ( $hide_count_when_zero && $count === 0 ) ? 'hidden="hidden"' : ''; ?>>
		<?php echo esc_html( $count ); ?>
	</span>
</a>
