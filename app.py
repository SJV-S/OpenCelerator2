from flask import Flask, render_template

app = Flask(__name__)

# Valid chart types (templates are loaded client-side)
VALID_CHART_TYPES = {'Daily', 'Weekly', 'Monthly', 'Yearly', 'Timing', 'FrequencyCollections'}
VALID_MINUTE_TYPES = {'minute', 'count'}


@app.route('/')
def index():
    return render_template('SCC/menu_page.html')


@app.route('/chart/<chart_type>/<minute_type>')
def chart(chart_type, minute_type):
    # Validate chart type
    if chart_type not in VALID_CHART_TYPES:
        return f"Unknown chart type: {chart_type}", 404

    # Validate minute type
    if minute_type not in VALID_MINUTE_TYPES:
        return f"Unknown minute type: {minute_type}", 404

    # Render page - templates are loaded client-side via JS modules
    return render_template('SCC/chart.html', chart_type=chart_type, minute_type=minute_type)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)
