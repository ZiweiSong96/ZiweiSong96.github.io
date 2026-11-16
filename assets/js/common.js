// Launches images tagged `.lazy` when they scroll into view.
$(function () {
    $('.lazy').Lazy({
        scrollDirection: 'vertical',
        effect: 'fadeIn',
        effectTime: 300,
        visibleOnly: true,
        placeholder: '',
        afterLoad: function (element) {
            element.css('min-height', '0');
        },
        onError: function (element) {
            console.log('[lazyload] Error loading ' + element.data('src'));
        }
    });
});
