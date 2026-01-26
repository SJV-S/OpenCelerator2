from flask import Flask, render_template, request
import json
import math

app = Flask(__name__)

chart_configs = {
    'daily_minute_280x_28w_template.json': 28,
    'daily_minute_280x_56w_template.json': 56,
    'daily_minute_280x_42w_template.json': 42,
    'daily_minute_280x_140w_template.json': 140
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
    # Get container dimensions from query parameters
    container_width = request.args.get('width', type=float)
    container_height = request.args.get('height', type=float)

    # If dimensions not provided, render initial page that will redirect with dimensions
    if container_width is None or container_height is None:
        return render_template('SCC/chart.html', initial_load=True)

    # Calculate required width for each template and find best fit
    # Sort templates by chart window days (descending) to check largest first
    sorted_templates = sorted(chart_configs.items(), key=lambda x: x[1], reverse=True)

    best_template = None

    for template_name, chart_window_days in sorted_templates:
        # Load template to get margin values
        filepath = f'charts/layouts/{template_name}'
        with open(filepath, 'r') as f:
            template_data = json.load(f)

        margin = template_data['layout']['margin']
        required_width = check_chart_width_by_height(
            container_height,
            chart_window_days,
            margin['t'],
            margin['b'],
            margin['l'],
            margin['r']
        )

        print(f"Template: {template_name}")
        print(f"  Chart window days: {chart_window_days}")
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
        best_template = min(chart_configs.keys(), key=lambda k: chart_configs[k])

    # Load the selected template
    filepath = f'charts/layouts/{best_template}'
    with open(filepath, 'r') as f:
        fig_json = f.read()

    # Get chart viewport variable
    max_window_width = chart_configs[best_template] + 0.4

    return render_template('SCC/chart.html',
                         plot_json=fig_json,
                         max_window_width=max_window_width,
                         initial_load=False)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

