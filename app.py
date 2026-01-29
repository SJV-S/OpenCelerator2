from flask import Flask, render_template

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('SCC/menu_page.html')


@app.route('/chart/<chart_id>')
def chart(chart_id):
    # Render page - chart data loaded client-side from storage
    return render_template('SCC/chart.html', chart_id=chart_id)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)
