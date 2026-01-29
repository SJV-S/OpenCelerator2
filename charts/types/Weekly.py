import math
import plotly.graph_objs as go
import pandas as pd


class WeeklySCC:
    def __init__(self, minute_type=True, xmax=100, chart_window_in_weeks=100, start_date=None):
        """
        Weekly SCC chart using Plotly.

        Args:
            minute_type: If True, shows count per minute with right y-axis for counting times.
                        If False, shows count per week without right y-axis.
            xmax: Maximum x-axis value (number of week positions). Default 100 (20 months x 5 weeks).
            chart_window_in_weeks: The viewport width in weeks. Controls zoom level.
            start_date: Starting date for calculating Sunday positions. Defaults to today.
        """
        self.minute_type = minute_type
        self.height = 675
        self.style_color = '#05c3de'
        self.grid_color = '#6ad1e3'
        self.font_family = 'Tahoma, DejaVu Sans, Verdana, sans-serif'
        self.font_size = 18
        self.font_weight = 'bold'
        self.grid_width = 1
        self.spine_width = 2

        if minute_type:
            self.ymin = 0.001 * 0.69
            self.ymax = 1000
            self.left_y_minor_vals = [0.005, 0.05, 0.5, 5, 50, 500]
            self.left_y_major_vals = [0.001, 0.01, 0.1, 1, 10, 100, 1000]
        else:
            self.ymin = 1 * 0.69
            self.ymax = 1000000
            self.left_y_minor_vals = [5, 50, 500, 5000, 50000, 500000]
            self.left_y_major_vals = [1, 10, 100, 1000, 10000, 100000, 1000000]

        self.xmin = 0
        self.xmax = xmax
        self.chart_window_in_weeks = chart_window_in_weeks
        self.margin_l = 110 if minute_type else 140
        self.margin_r = 120 if minute_type else 105
        self.margin_t = 145  # Extra space for month count + month labels rows
        self.margin_b = 90

        self.deg = 34
        self.unit = 4  # weeks per doubling
        self.yaxis_px = self.height - (self.margin_t + self.margin_b)
        self.y_axis = math.log10(self.ymax) - math.log10(self.ymin)
        self.delta_y = math.log10(2 ** (self.chart_window_in_weeks / self.unit))
        self.delta_y_px = self.delta_y / self.y_axis * self.yaxis_px
        self.xaxis_px = self.delta_y_px / math.tan(math.radians(self.deg))
        self.width = self.xaxis_px + (self.margin_l + self.margin_r)

        px_right_n_left_y_tick_len = 6
        self.paper_right_n_left_y_tick_len = px_right_n_left_y_tick_len / self.xaxis_px

        # Date handling
        if start_date is None:
            self.start_date = pd.to_datetime('today').normalize()
        else:
            self.start_date = pd.to_datetime(start_date).normalize()

        # Calculate number of months needed (5 week positions per month)
        self.num_months = (self.xmax + 4) // 5

        # Calculate Sunday positions and month data
        self._calculate_date_positions()

        self.fig = go.Figure()

    def get_sundays_for_months(self, months):
        """Calculate actual Sunday positions within each month."""
        result = {}
        index = 0

        for month in months:
            start_date = pd.to_datetime(month).normalize().replace(day=1)
            sundays = pd.date_range(start_date, periods=31, freq='W-SUN')
            sundays = [sunday for sunday in sundays if sunday.month == start_date.month]

            for i in range(5):
                if i < len(sundays):
                    result[index] = sundays[i]
                index += 1

        return result

    def _calculate_date_positions(self):
        """Calculate all date-related positions and labels."""
        # Get the first day of the previous month
        self.weekday_of_previous_month = (
            self.start_date.replace(day=1) - pd.Timedelta(days=1)
        ).replace(day=1).normalize()

        # Generate month range
        self.months = pd.date_range(
            pd.to_datetime(self.weekday_of_previous_month).normalize().replace(day=1),
            periods=self.num_months,
            freq='MS'
        )

        # Get Sunday positions
        sunday_map = self.get_sundays_for_months(self.months)
        self.date_to_pos = {v: k for k, v in sunday_map.items()}
        self.all_dates = [date for date in self.date_to_pos.keys()]

        # Bottom x-axis ticks - only at actual Sunday positions
        self.sunday_positions = sorted([k for k in self.date_to_pos.values()])
        if self.xmax not in self.sunday_positions:
            self.sunday_positions.append(self.xmax)

        # Month labels (e.g., "Jan\n26")
        self.month_labels = self.months.strftime("%b\n%y").tolist()

    def create_xaxis(self):
        # Bottom x-axis: ticks at actual Sunday positions
        # Labels show cumulative week count (index), displayed at positions divisible by 10
        tick_vals = self.sunday_positions
        tick_labels = []
        for idx, pos in enumerate(tick_vals):
            if pos % 10 == 0:
                # Show the actual week count (index), not the position
                tick_labels.append(str(idx))
            else:
                tick_labels.append('')

        return dict(
            tickvals=tick_vals,
            ticktext=tick_labels,
            tickmode='array',
            tick0=0,
            ticklabelstandoff=18,
            showline=False,
            tickfont=dict(
                size=self.font_size,
                family=self.font_family,
                color=self.style_color,
                weight=self.font_weight
            ),
            title=dict(
                text='',
                standoff=0,
                font=dict(
                    size=self.font_size,
                    family=self.font_family,
                    color=self.style_color,
                    weight=self.font_weight
                )
            ),
            showgrid=False,
            zeroline=False,
            range=[-0.2, self.chart_window_in_weeks + 0.2],
            fixedrange=False,
        )

    def create_left_yaxis(self):
        left_y_ticks = [10 ** e for e in [math.log10(i) for i in self.left_y_major_vals]]
        return dict(
            showline=False,
            tickvals=left_y_ticks,
            tickfont=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight=self.font_weight),
            ticklabelposition='outside',
            ticklabelstandoff=7,
            title=dict(
                text="COUNT PER MINUTE" if self.minute_type else "COUNT PER WEEK",
                standoff=0,
                font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight=self.font_weight)
            ),
            showgrid=False,
            zeroline=False,
            type='log',
            range=[math.log10(self.ymin), math.log10(self.ymax)],
            tickformat=',',
            fixedrange=True
        )

    def add_custom_y_axis_labels(self):
        font_size_scale = 0.7
        x_shift = -5

        for tick in self.left_y_minor_vals:
            log_tick = math.log10(tick)

            self.fig.add_annotation(
                xref="paper",
                yref="y",
                x=-0.004,
                y=log_tick,
                text=f"{tick:,}",
                showarrow=False,
                font=dict(
                    size=self.font_size * font_size_scale,
                    family=self.font_family,
                    color=self.style_color,
                    weight=self.font_weight
                ),
                align="right",
                xanchor="right",
                xshift=x_shift,
                yanchor="middle",
                name='minor-left-y'
            )

    def create_right_yaxis(self):
        if self.minute_type:
            right_axis_color = self.style_color
        else:
            right_axis_color = 'rgba(0,0,0,0)'

        right_y_ticks_seconds = [10 / 60, 15 / 60, 20 / 60, 30 / 60, 1, 2, 5, 10, 20, 60, 50, 100, 200, 500, 1000, 60 * 2, 60 * 4, 60 * 8, 60 * 16]
        right_y_ticks = [1 / m for m in right_y_ticks_seconds]
        right_y_ticks_log_mapped = [math.log10(t) for t in right_y_ticks]
        right_y_labels = ['10" sec', '15"', '20"', '30"', "1' min", "2'", "5'", "10'", "20'", "            – 1 h", "50'", "100'", "200'", "500'", "1000'",
                         "            – 2 h",
                         "            – 4 h",
                         "            – 8 h",
                         "            – 16 h"]

        ann_offset = 1 + (30 / self.xaxis_px)
        self.fig.add_annotation(
            x=ann_offset,
            y=0.95,
            xref="paper",
            yref="paper",
            text="COUNTING TIMES",
            showarrow=False,
            font=dict(size=self.font_size * 0.7, family=self.font_family, color=right_axis_color, weight='bold'),
            align="center",
            textangle=-90,
        )

        return dict(
            showline=False,
            tickfont=dict(size=self.font_size * 0.6, family=self.font_family, color=right_axis_color, weight=self.font_weight),
            ticklabelposition='outside',
            ticklabelstandoff=10,
            showgrid=False,
            zeroline=False,
            side='right',
            range=[math.log10(self.ymin), math.log10(self.ymax)],
            overlaying='y',
            tickmode='array',
            tickvals=right_y_ticks_log_mapped,
            ticktext=right_y_labels,
            fixedrange=True
        )

    def add_placeholder_data(self):
        x_placeholder = []
        y_placeholder = []
        self.fig.add_trace(go.Scatter(x=x_placeholder, y=y_placeholder, mode='lines', name="Left Axis Trace"))
        self.fig.add_trace(go.Scatter(x=x_placeholder, y=y_placeholder, mode='lines', name="Right Axis Trace", yaxis='y2', visible=False))

    def major_vertical_grid(self):
        """Major vertical grid lines at month boundaries (every 5 weeks) - trace-based for pan performance."""
        scaling_factor = 2.5
        x_vals = []
        y_vals = []
        for i in range(5, self.xmax, 5):
            x_vals.extend([i, i, None])
            y_vals.extend([self.ymin, self.ymax, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals,
            y=y_vals,
            mode='lines',
            line=dict(color=self.grid_color, width=self.grid_width * scaling_factor),
            hoverinfo='skip',
            showlegend=False,
            name='grid-major-vertical'
        ))

    def left_n_right_fake_spines(self):
        scaling_factor = 2.5
        for i in [self.xmin, self.xmax]:
            self.fig.add_shape(
                type="line",
                x0=i, x1=i,
                yref='y',
                y0=self.ymin,
                y1=self.ymax,
                line=dict(color=self.grid_color, width=self.grid_width * scaling_factor),
                layer='below',
                name='spine'
            )

    def minor_vertical_grid(self):
        """Minor vertical grid lines only at actual Sunday positions (non-uniform) - trace-based for pan performance."""
        x_vals = []
        y_vals = []
        for pos in self.sunday_positions:
            if pos <= self.xmax:
                x_vals.extend([pos, pos, None])
                y_vals.extend([self.ymin, self.ymax, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals,
            y=y_vals,
            mode='lines',
            line=dict(color=self.grid_color, width=self.grid_width * 0.5),
            hoverinfo='skip',
            showlegend=False,
            name='grid-minor-vertical'
        ))

    def major_horizontal_grid(self):
        """Major and sub-major horizontal grid lines - trace-based for pan performance."""
        scaling_factor = 1.5
        x_buffer = 500
        x_left = self.xmin - x_buffer
        x_right = self.xmax + x_buffer

        # Major horizontal lines
        x_vals_major = []
        y_vals_major = []
        for power in self.left_y_major_vals:
            x_vals_major.extend([x_left, x_right, None])
            y_vals_major.extend([power, power, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals_major,
            y=y_vals_major,
            mode='lines',
            line=dict(color=self.grid_color, width=self.grid_width * scaling_factor),
            hoverinfo='skip',
            showlegend=False,
            name='grid-major-horizontal'
        ))

        # Sub-major horizontal lines
        x_vals_sub = []
        y_vals_sub = []
        for power in self.left_y_minor_vals:
            x_vals_sub.extend([x_left, x_right, None])
            y_vals_sub.extend([power, power, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals_sub,
            y=y_vals_sub,
            mode='lines',
            line=dict(color=self.grid_color, width=self.spine_width * 0.5),
            hoverinfo='skip',
            showlegend=False,
            name='grid-sub-horizontal'
        ))

    def minor_horizontal_grid(self):
        """Minor horizontal grid lines - trace-based for pan performance."""
        x_buffer = 500
        x_left = self.xmin - x_buffer
        x_right = self.xmax + x_buffer

        x_vals = []
        y_vals = []
        for power in self.left_y_major_vals:
            # Use pure Python instead of np.arange to avoid serialization issues
            power_range = [power * i for i in range(1, 10)]
            for val in power_range:
                if val not in self.left_y_minor_vals:
                    x_vals.extend([x_left, x_right, None])
                    y_vals.extend([val, val, None])

        self.fig.add_trace(go.Scatter(
            x=x_vals,
            y=y_vals,
            mode='lines',
            line=dict(color=self.grid_color, width=self.grid_width * 0.5),
            hoverinfo='skip',
            showlegend=False,
            name='grid-minor-horizontal'
        ))

    def add_fake_spines(self):
        position = -0.03
        # Bottom spine
        self.fig.add_shape(
            type="line",
            x0=self.xmin, x1=self.xmax, yref='paper', y0=position, y1=position,
            line=dict(color=self.grid_color, width=self.spine_width))

        # Bottom tick marks - only at positions with labels (every 10)
        for i in range(0, self.xmax + 10, 10):
            if i <= self.xmax:
                self.fig.add_shape(
                    type="line",
                    x0=i, x1=i,
                    yref='paper',
                    y0=position + 0.01, y1=position - 0.01,
                    line=dict(color=self.grid_color, width=self.spine_width),
                    name='x-tick'
                )

        # Top spine
        self.fig.add_shape(
            type='line',
            x0=-self.paper_right_n_left_y_tick_len,
            x1=1,
            y0=self.ymax, y1=self.ymax,
            xref='paper', yref='y',
            line=dict(color=self.grid_color, width=self.spine_width * 2),
            name='top-spine'
        )

        # Top tick marks - at every month boundary (every 5 weeks) as separators
        # These extend up through the month labels to create visual barriers
        # Height should reach just below the month count numbers (which are at ~68px offset)
        tick_height_paper = 55 / self.yaxis_px  # Match the month_name area
        for i in range(0, self.xmax + 5, 5):
            if i <= self.xmax:
                self.fig.add_shape(
                    type="line",
                    x0=i, x1=i,
                    yref='paper',
                    y0=1 + tick_height_paper, y1=1,
                    line=dict(color=self.grid_color, width=self.spine_width),
                    name='top-x-tick'
                )

    def custom_left_y_ticks(self):
        ticks = self.left_y_major_vals + self.left_y_minor_vals
        for tick in ticks:
            tick_width = self.spine_width if tick in self.left_y_major_vals else self.grid_width
            self.fig.add_shape(
                type="line",
                xref="paper",
                yref="y",
                x0=0, x1=-self.paper_right_n_left_y_tick_len,
                y0=tick, y1=tick,
                line=dict(color=self.grid_color, width=tick_width),
                name='left-y-tick'
            )

    def custom_right_y_ticks(self):
        if self.minute_type:
            right_y_ticks = [10 / 60, 15 / 60, 20 / 60, 30 / 60, 1, 2, 5, 10, 20, 60, 50, 100, 200, 500, 1000, 60 * 2, 60 * 4, 60 * 8, 60 * 16]
            right_y_ticks_hours = [60, 60 * 2, 60 * 4, 60 * 8, 60 * 16]

            for tick in right_y_ticks:
                if tick in self.left_y_major_vals:
                    tick_width = self.spine_width
                elif tick not in right_y_ticks_hours:
                    tick_width = self.grid_width
                else:
                    tick_width = 0

                self.fig.add_shape(
                    type="line",
                    xref="paper",
                    yref="y",
                    x0=1, x1=1 + self.paper_right_n_left_y_tick_len,
                    y0=1 / tick, y1=1 / tick,
                    line=dict(color=self.grid_color, width=tick_width),
                    name='right-y-tick'
                )

    def add_date_lines(self):
        font_scale = 0.8
        month_label_scale = 0.65  # Smaller font for month names

        # Offset values in pixels - ordered from top spine upward:
        # 1. Tick barriers (defined in add_fake_spines)
        # 2. Month names (between tick barriers)
        # 3. Month count numbers (above tick barriers)
        # 4. Axis title
        month_name_pixel_offset = 35   # Within the tick barrier zone
        month_count_pixel_offset = 68  # Above the tick barriers
        top_x_title_pixel_offset = 100
        bottom_x_title_pixel_offset = 75

        # Convert pixel offsets to 'paper' offsets
        month_name_paper_offset = month_name_pixel_offset / self.yaxis_px
        month_count_paper_offset = month_count_pixel_offset / self.yaxis_px
        top_x_title_paper_offset = top_x_title_pixel_offset / self.yaxis_px
        bottom_x_title_paper_offset = bottom_x_title_pixel_offset / self.yaxis_px

        # Get positions as 'paper' coordinates
        month_name_pos = 1 + month_name_paper_offset
        month_count_pos = 1 + month_count_paper_offset
        top_x_title_pos = 1 + top_x_title_paper_offset
        bottom_x_title_pos = 0 - bottom_x_title_paper_offset

        # Bottom axis title
        self.fig.add_annotation(
            x=0.5,
            y=bottom_x_title_pos,
            xref="paper",
            yref="paper",
            text='SUCCESSIVE CALENDAR WEEKS',
            showarrow=False,
            font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight='bold'),
            align="center",
            name='bottom_x_title'
        )

        # Top axis title
        self.fig.add_annotation(
            x=0.5,
            y=top_x_title_pos,
            xref="paper",
            yref="paper",
            text='SUCCESSIVE CALENDAR MONTHS',
            showarrow=False,
            font=dict(size=self.font_size, family=self.font_family, color=self.style_color, weight='bold'),
            align="center",
            name='top_x_title'
        )

        # Month count labels (0, 2, 4, 6...) - positioned at every other month boundary (every 10 weeks)
        for pos in range(0, self.xmax + 10, 10):
            if pos > self.xmax:
                break
            month_count = (pos // 5)  # Every 5 weeks = 1 month, so pos/10 * 2 = pos/5
            self.fig.add_annotation(
                x=pos,
                y=month_count_pos,
                xref="x",
                yref="paper",
                text=str(month_count),
                showarrow=False,
                font=dict(size=self.font_size * font_scale, family=self.font_family, color=self.style_color, weight='bold'),
                align="center",
                name='month-count'
            )

        # Month name labels - centered in each 5-week block (at position + 2.5)
        for idx, month_pos in enumerate(range(0, self.xmax, 5)):
            center_pos = month_pos + 2.5
            if center_pos > self.xmax:
                break

            # Use actual month label or placeholder
            if idx < len(self.month_labels):
                label_text = self.month_labels[idx]
            else:
                label_text = f"INSERTDATE{idx}"

            self.fig.add_annotation(
                x=center_pos,
                y=month_name_pos,
                xref="x",
                yref="paper",
                text=label_text,
                showarrow=False,
                font=dict(size=self.font_size * month_label_scale, family=self.font_family, color=self.style_color, weight='bold'),
                align="center",
                name=f'month-label-{idx}'
            )

    def get_plot(self, to_json=False):
        # Grid traces must be added FIRST to render behind data traces
        self.minor_vertical_grid()
        self.major_vertical_grid()
        self.minor_horizontal_grid()
        self.major_horizontal_grid()

        # Add placeholder data traces (will appear in front of grid)
        self.add_placeholder_data()

        self.fig.update_layout(
            showlegend=False,
            xaxis=self.create_xaxis(),
            yaxis=self.create_left_yaxis(),
            yaxis2=self.create_right_yaxis(),
            plot_bgcolor='white',
            paper_bgcolor='white',
            width=self.width,
            height=self.height,
            autosize=False,
            dragmode='pan',
            annotations=[],
            margin=dict(l=self.margin_l, r=self.margin_r, t=self.margin_t, b=self.margin_b)
        )

        # Axes and ticks (remain as shapes)
        self.custom_left_y_ticks()
        self.custom_right_y_ticks()
        self.add_custom_y_axis_labels()

        # Other elements (remain as shapes)
        self.add_fake_spines()
        self.left_n_right_fake_spines()
        self.add_date_lines()

        return self.fig.to_json() if to_json else self.fig


def preview(minute_type=True):
    """Show the chart in browser for testing."""
    plot = WeeklySCC(minute_type=minute_type)
    fig = plot.get_plot()
    fig.show()


if __name__ == '__main__':
    preview()
