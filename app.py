from flask import Flask, render_template, request
import json
import math

app = Flask(__name__)

# Templates organized by chart type
# Format: {template_filename: window_size_in_weeks}
chart_configs = {
    'Daily': {
        'dir': 'daily',
        'templates': {f'daily_280x_{d}d_template.json': d for d in range(28, 141, 14)}
    },
    'Weekly': {
        'dir': 'weekly',
        'templates': {f'weekly_200x_{w}w_template.json': w for w in list(range(8, 100, 8)) + [100]}
    },
    'Monthly': {
        'dir': 'monthly',
        'templates': {f'monthly_240x_{m}m_template.json': m for m in range(24, 121, 24)}
    },
    'Yearly': {
        'dir': 'yearly',
        'templates': {f'yearly_200x_{y}y_template.json': y for y in range(20, 101, 20)}
    },
    'Timing': {
        'dir': 'daily',  # Uses daily templates
        'templates': {'daily_280x_140d_template.json': 140}
    },
    'FrequencyCollections': {
        'dir': 'frequency_collections',
        'templates': {'frequency_collections_10cols_7pts_template.json': 10}
    }
}

def check_chart_width_by_height(container_height, chart_window_in_days, margin_t, margin_b, margin_l, margin_r):
    """Calculate required width for a chart given height and template parameters"""
    height = container_height * 0.90
    ymin = 1 * 0.69
    ymax = 1000000
    deg = 34  # desired angle of doubling in degrees
    unit = 7  # number of units per doubling
    yaxis_px = height - (margin_t + margin_b)
    y_axis = math.log10(ymax) - math.log10(ymin)
    delta_y = math.log10(2 ** (chart_window_in_days / unit))
    delta_y_px = delta_y / y_axis * yaxis_px
    xaxis_px = delta_y_px / math.tan(math.radians(deg))
    width = xaxis_px + (margin_l + margin_r)
    return width

@app.route('/')
def index():
    return render_template('SCC/menu_page.html')


@app.route('/chart/<chart_type>/<minute_type>')
def chart(chart_type, minute_type):
    # Validate chart type
    if chart_type not in chart_configs:
        return f"Unknown chart type: {chart_type}", 404

    # Validate minute type
    if minute_type not in ('minute', 'count'):
        return f"Unknown minute type: {minute_type}", 404

    # Get config for this chart type
    config = chart_configs[chart_type]
    templates = config['templates']
    chart_dir = config['dir']

    # Get container dimensions from query parameters
    container_width = request.args.get('width', type=float)
    container_height = request.args.get('height', type=float)

    # If dimensions not provided, render initial page that will redirect with dimensions
    if container_width is None or container_height is None:
        return render_template('SCC/chart.html', initial_load=True, chart_type=chart_type, minute_type=minute_type)

    # Calculate required width for each template and find best fit
    # Sort templates by window size (descending) to check largest first
    sorted_templates = sorted(templates.items(), key=lambda x: x[1], reverse=True)

    best_template = None

    for template_name, chart_window_weeks in sorted_templates:
        # Load template to get margin values
        filepath = f'charts/layouts/{minute_type}/{chart_dir}/{template_name}'
        with open(filepath, 'r') as f:
            template_data = json.load(f)

        margin = template_data['layout']['margin']
        required_width = check_chart_width_by_height(
            container_height,
            chart_window_weeks,
            margin['t'],
            margin['b'],
            margin['l'],
            margin['r']
        )

        print(f"Template: {template_name}")
        print(f"  Chart window weeks: {chart_window_weeks}")
        print(f"  Required width: {required_width:.2f}")
        print(f"  Container width: {container_width:.2f}")
        print(f"  Fits: {required_width <= container_width}")

        # Select first template that fits (which will be the largest since we're sorted descending)
        if required_width <= container_width:
            best_template = template_name
            print(f"  ✓ Best fit found - breaking out of loop!")
            print()
            break
        print()

    # Fallback to smallest template if none fit
    if best_template is None:
        best_template = min(templates.keys(), key=lambda k: templates[k])

    # Load the selected template
    filepath = f'charts/layouts/{minute_type}/{chart_dir}/{best_template}'
    with open(filepath, 'r') as f:
        fig_json = f.read()

    # Get chart viewport variable
    max_window_width = templates[best_template] + 0.4

    return render_template('SCC/chart.html',
                         plot_json=fig_json,
                         max_window_width=max_window_width,
                         initial_load=False,
                         chart_type=chart_type,
                         minute_type=minute_type)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

