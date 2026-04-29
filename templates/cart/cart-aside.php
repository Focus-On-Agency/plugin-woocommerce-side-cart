<?php
/**
 *
 * Override this template by copying it to yourtheme/woocommerce/cart/cart-aside.php
 *
 * @author 		Creative Little Dots
 * @package 	WooCommerce/Templates
 * @version     1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

global $wc_side_cart; 

do_action( 'wc_side_cart_before' );

$side_cart_visibility = isset( $side_cart_visibility ) ? (string) $side_cart_visibility : 'normal';
$is_hidden = ( $side_cart_visibility === 'hidden' );

$is_empty = WC()->cart->is_empty();

?>

<aside
	id="wc-side-cart-panel"
	class="side-cart woocommerce"
	role="dialog"
	aria-modal="true"
	aria-labelledby="wc-side-cart-title"
	aria-hidden="true"
	tabindex="-1"
	<?php echo $is_hidden ? ' hidden="hidden"' : ''; ?>
>
	<div class="side-cart__container js-side-cart-container">
			
    	<div class="side-cart__iconic">
    		
    		<a href="<?php echo esc_url( wc_get_cart_url() ); ?>" class="side-cart__icon">
				<span class="screen-reader-text"><?php echo esc_html__( 'View cart', 'woocommerce' ); ?></span>
        		
        		<span class="side-cart__number">
        		
        		    <?php echo esc_html( absint( apply_filters( 'wc_side_cart_contents_count', WC()->cart->cart_contents_count ) ) ); ?>
        		    
        		</span>
        		
    		</a>
    	
    		<h5 id="wc-side-cart-title" class="side-cart__top_title"><?php echo wp_kses_post( apply_filters( 'wc_side_cart_heading', __( 'Cart', 'woocommerce' ) ) ); ?></h5>
    		
    		<button type="button" class="js-side-cart-close side-cart__close" aria-label="<?php echo esc_attr__( 'Close', 'woocommerce' ); ?>">&times;</button>
    		
    	</div>
    	
    	<form action="<?php echo esc_url( wc_get_cart_url() ); ?>" method="post" class="js-side-cart-form side-cart__form">
			<?php wc_get_template( 'cart/cart-aside-items.php', array(), false, $wc_side_cart->templates_path() ); ?>

			<div class="side-cart__footer" <?php echo $is_empty ? 'hidden' : ''; ?>>
			
				<?php wc_get_template( 'cart/cart-aside-totals.php', array(), false, $wc_side_cart->templates_path() ); ?>
				
				<?php wp_nonce_field( 'woocommerce-cart' ); ?>
				
			</div>
    	
    	</form>
    	
    </div>
		
</aside>

<div id="wcsc-live-region" class="wcsc-sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
<div id="wcsc-alert-region" class="wcsc-sr-only" role="alert" aria-live="assertive" aria-atomic="true"></div>

<div class="wc-side-cart-backdrop js-side-cart-backdrop" aria-hidden="true" role="presentation" <?php echo $is_hidden ? ' hidden="hidden"' : ''; ?>></div>
<?php do_action( 'wc_side_cart_after' ); ?>
