from flask import Flask, render_template, request

app = Flask(__name__)

# Templates organized by chart type - using largest template only
chart_configs = {
    'Daily': {
        'dir': 'daily',
        'template': 'daily_280x_140d_template.json',
        'max_window': 140
    },
    'Weekly': {
        'dir': 'weekly',
        'template': 'weekly_200x_100w_template.json',
        'max_window': 100
    },
    'Monthly': {
        'dir': 'monthly',
        'template': 'monthly_240x_120m_template.json',
        'max_window': 120
    },
    'Yearly': {
        'dir': 'yearly',
        'template': 'yearly_200x_100y_template.json',
        'max_window': 100
    },
    'Timing': {
        'dir': 'daily',
        'template': 'daily_280x_140d_template.json',
        'max_window': 140
    },
    'FrequencyCollections': {
        'dir': 'frequency_collections',
        'template': 'frequency_collections_10cols_7pts_template.json',
        'max_window': 70
    }
}


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
    chart_dir = config['dir']
    template_name = config['template']
    max_window = config['max_window']

    # Get container dimensions from query parameters
    container_width = request.args.get('width', type=float)
    container_height = request.args.get('height', type=float)

    # If dimensions not provided, render initial page that will redirect with dimensions
    if container_width is None or container_height is None:
        return render_template('SCC/chart.html', initial_load=True, chart_type=chart_type, minute_type=minute_type)

    # Load the largest template
    filepath = f'charts/layouts/{minute_type}/{chart_dir}/{template_name}'
    with open(filepath, 'r') as f:
        fig_json = f.read()

    return render_template('SCC/chart.html',
                         plot_json=fig_json,
                         max_window_width=max_window + 0.4,
                         initial_load=False,
                         chart_type=chart_type,
                         minute_type=minute_type)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)

