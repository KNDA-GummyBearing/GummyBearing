"""최종 노트북의 실제 공통 함수 셀을 검증함. 노트북 전체 실행/파일 저장은 하지 않음.

실행: python -m unittest discover -s tests -p test_xjtu_final_model_comparison.py
"""
from pathlib import Path
import json
import unittest
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT/'notebooks/05_xjtu_final_model_comparison.ipynb'
namespace = {}
notebook = json.loads(NOTEBOOK.read_text(encoding='utf-8'))
for cell in notebook['cells']:
    if cell.get('metadata', {}).get('analysis_role') == 'library':
        exec(compile(''.join(cell['source']), str(NOTEBOOK), 'exec'), namespace)


class AlarmSemanticsTests(unittest.TestCase):
    def test_b_rule_does_not_mix_axes(self):
        z = np.zeros((7, 2, 3))
        z[2:, 0, 0] = 4  # H RMS만 초과
        z[2:, 1, 2] = 4  # V Peak만 초과
        raw, confirmed = namespace['rule_flags']({'fixed': z}, 'fixed', 2, 2, 4, 'consecutive')
        self.assertFalse(raw.any())
        self.assertFalse(confirmed.any())

    def test_b_rule_does_not_count_rotating_votes(self):
        z = np.zeros((6, 2, 3))
        z[2:, 0, 0] = 4
        z[2:4, 0, 1] = 4
        z[4:, 0, 2] = 4
        raw, confirmed = namespace['rule_flags']({'fixed': z}, 'fixed', 2, 2, 4, 'consecutive')
        self.assertTrue(raw[2:, 0].all())  # 매번 2/3이지만 두 번째 특징은 바뀜
        self.assertFalse(confirmed.any())

    def test_counts_ignore_baseline_and_reset_only_consecutive(self):
        flags = np.array([True, True, True, False, True, True])[:, None]
        consecutive = namespace['count_conditions'](flags, 2, 'consecutive').ravel()
        cumulative = namespace['count_conditions'](flags, 2, 'cumulative').ravel()
        np.testing.assert_array_equal(consecutive, [0, 0, 1, 0, 1, 2])
        np.testing.assert_array_equal(cumulative, [0, 0, 1, 1, 2, 3])

    def test_p_included_and_simultaneous_axis_mean(self):
        raw = np.array([[0,0], [1,1], [1,0], [0,1]], dtype=bool)
        confirmed = np.array([[0,0], [1,1], [0,0], [0,0]], dtype=bool)
        row = namespace['evaluate_rule'](np.arange(1,5), raw, confirmed)
        self.assertEqual(row['t_P'], 2)
        self.assertEqual(row['t_P_elapsed_min'], 1)
        self.assertEqual(row['lead_time_min'], 2)
        self.assertEqual(row['post_P_observations'], 3)
        self.assertEqual(row['first_alarm_axis'], 'H+V')
        self.assertEqual(row['OR_persistence_pct'], 100)
        self.assertAlmostEqual(row['first_axis_persistence_pct'], 200/3)

    def test_no_alarm_and_end_alarm_are_distinct(self):
        flags = np.zeros((4,2), dtype=bool)
        row = namespace['evaluate_rule'](np.arange(1,5), flags, flags)
        self.assertEqual(row['alarm_state'], 'no_alarm')
        self.assertTrue(np.isnan(row['lead_time_min']))
        flags[-1, 0] = True
        row = namespace['evaluate_rule'](np.arange(1,5), flags, flags)
        self.assertEqual(row['alarm_state'], 'alarm_at_end')
        self.assertEqual(row['lead_time_min'], 0)
        self.assertEqual(row['OR_persistence_pct'], 100)

    def test_missing_bearing_not_hidden_in_summary(self):
        rows = []
        for bearing, state, lead, rate in [('a','alarm_before_end',100,95),('b','no_alarm',np.nan,np.nan)]:
            rows.append(dict(bearing=bearing, baseline_n=20, monitoring_start_observation=21,
                detector='fixed',model='Fixed RMS',m_of_3=0,k=4,alarm_mode='consecutive',
                alarm_state=state,lead_time_min=lead,OR_persistence_pct=rate,first_axis_persistence_pct=rate))
        summary = namespace['summarize_results'](pd.DataFrame(rows))
        self.assertEqual(summary.iloc[0].population, 2)
        self.assertEqual(summary.iloc[0].no_alarm_count, 1)
        self.assertTrue(np.isnan(summary.iloc[0].min_lead_time_min))
        self.assertEqual(summary.iloc[0].conditional_min_lead_time_min, 100)
        self.assertFalse(summary.iloc[0].all_before_end)


class ActualDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = ROOT/'DATA/features/XJTU_SY_total_features.csv'
        if not source.exists():
            raise unittest.SkipTest('실데이터 회귀검증 입력 CSV가 로컬에 없음')
        cls.data = namespace['validate_input'](pd.read_csv(source))
        cls.gate = namespace['baseline_scan'](cls.data)

    def test_gate_and_short_bearing_preserved(self):
        counts = self.gate.groupby('baseline_n').baseline_pass.sum()
        self.assertEqual(counts.loc[15], 8)
        self.assertEqual(counts.loc[20], 6)
        self.assertEqual(len(self.gate), 46*15)
        short = self.gate[self.gate.bearing.eq('Bearing2_4') & self.gate.baseline_n.gt(42)]
        self.assertEqual(len(short), 8)
        self.assertTrue(short.baseline_state.eq('insufficient_data').all())
        self.assertTrue(short.filter(like='_mk_p').isna().all().all())

    def test_existing_fixed_b2of3_first_alarms(self):
        expected = {'Bearing1_5':38,'Bearing2_1':456,'Bearing2_2':51,
                    'Bearing2_3':131,'Bearing3_2':2029,'Bearing3_4':1421}
        columns = namespace['FEATURE_COLUMNS']
        for bearing, p in expected.items():
            g = self.data[self.data.bearing.eq(bearing)]
            x = g[columns].to_numpy().reshape(-1,2,3)
            z = (x-x[:20].mean(0))/x[:20].std(0,ddof=1)
            raw,confirmed = namespace['rule_flags']({'fixed':z},'fixed',2,20,4,'consecutive')
            row = namespace['evaluate_rule'](g.timestamp,raw,confirmed)
            self.assertEqual(row['t_P'],p,bearing)

    def test_current_and_future_do_not_change_moving_reference(self):
        g = self.data[self.data.bearing.eq('Bearing1_5')]
        x = g[namespace['FEATURE_COLUMNS']].to_numpy().reshape(-1,2,3)
        first = namespace['fit_scores'](x,20)
        altered = x.copy()
        altered[30:] *= 7
        second = namespace['fit_scores'](altered,20)
        np.testing.assert_allclose(first['moving_mean'][:31],second['moving_mean'][:31],equal_nan=True)
        np.testing.assert_allclose(first['moving_sd'][:31],second['moving_sd'][:31],equal_nan=True)
        np.testing.assert_allclose(first['if_upper'],second['if_upper'])
        np.testing.assert_allclose(first['if_score'][:30],second['if_score'][:30])


if __name__ == '__main__':
    unittest.main()
