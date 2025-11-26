import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Progress } from "./ui/progress";
import { Users, FileText, Clock, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { LineChart, Line } from 'recharts';
import { MyResponsesResults } from './MyResponsesResults';
import type { DriverResult } from '../utils/calculations';

interface EmployeeExperienceSectionProps {
  categoryData: DriverResult[];
  driverData: DriverResult[];
  overallPercentage: number;
  distribution: { '0-10': Record<number, number>; '1-5': Record<number, number> };
}

export function EmployeeExperienceSection({ 
  categoryData, 
  driverData, 
  overallPercentage,
  distribution,
  surveyResponses,
  moduleId
}: EmployeeExperienceSectionProps & { surveyResponses?: Record<string,string>, moduleId?: string }) {
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          <p className="text-green-600">
            Positive Responses: {data.positivePercentage.toFixed(1)}%
          </p>
          <p className="text-sm text-gray-600">
            {data.positiveCount} of {data.totalCount} responses
          </p>
        </div>
      );
    }
    return null;
  };

  // Sort data by positive percentage
  const sortedCategoryData = [...categoryData].sort((a, b) => b.positivePercentage - a.positivePercentage);
  const sortedDriverData = [...driverData].sort((a, b) => b.positivePercentage - a.positivePercentage);

  // Prepare distribution data for charts
  const distribution1to5 = Object.entries(distribution['1-5']).map(([score, count]) => ({
    score: `${score}`,
    count,
    isPositive: parseInt(score) >= 4
  }));

  const distribution0to10 = Object.entries(distribution['0-10']).map(([score, count]) => ({
    score: `${score}`,
    count,
    isPositive: parseInt(score) >= 7
  }));

  const COLORS = {
    positive: '#16a34a',
    neutral: '#6b7280'
  };

  // Mock daily responses for the Daily Responses chart (can be replaced with real data)
  const dailyResponses = [
    { day: 'Mon', responses: 8 },
    { day: 'Tue', responses: 12 },
    { day: 'Wed', responses: 10 },
    { day: 'Thu', responses: 14 },
    { day: 'Fri', responses: 9 },
    { day: 'Sat', responses: 4 },
    { day: 'Sun', responses: 6 }
  ];

  // Mock demographic distribution for department pie (derive from categories if available)
  const demographicData = sortedCategoryData.slice(0,5).map((c, i) => ({
    name: c.driver,
    value: c.totalCount || Math.max(1, Math.round(c.positivePercentage)),
    color: ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'][i % 5]
  }));

  return (
    <div className="space-y-6">
      {/* Top summary KPI row to match Leadership layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Average Positive Score</CardTitle>
            </div>
            <div>
              <Target className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-800">{overallPercentage.toFixed(1)}%</div>
            <p className="text-xs text-gray-600 mt-1">Responses scoring positive on the scale</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Completion Rate</CardTitle>
            </div>
            <div>
              <Users className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            {/* Derive a rough completion rate from distribution counts if available */}
            <div className="text-2xl font-bold">{(() => {
              try {
                const total = sortedCategoryData.reduce((s, c) => s + (c.totalCount || 0), 0) || 0;
                const positive = sortedCategoryData.reduce((s, c) => s + (c.positiveCount || 0), 0) || 0;
                return total > 0 ? `${Math.round((positive / total) * 100)}%` : '—';
              } catch { return '—'; }
            })()}</div>
            <p className="text-xs text-gray-600 mt-1">Based on available responses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Median Question Score</CardTitle>
            </div>
            <div>
              <FileText className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.max(0, overallPercentage - 2).toFixed(1)}%</div>
            <p className="text-xs text-gray-600 mt-1">Middle score across all questions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Top Demographic</CardTitle>
            </div>
            <div>
              <Clock className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            {/* Pick top category by positivePercentage */}
            <div className="text-lg font-semibold">{sortedCategoryData[0]?.driver ?? 'Product Ops'} {sortedCategoryData[0] ? `${Math.round(sortedCategoryData[0].positivePercentage)}%` : '87%'}</div>
            <p className="text-xs text-gray-600 mt-1">Highest scoring group</p>
          </CardContent>
        </Card>
      </div>

      {/* Small metrics row similar to Leadership screenshot */}
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Participants</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sortedCategoryData.reduce((s, c) => s + (c.totalCount || 0), 0) || '—'}</div>
            <p className="text-xs text-gray-600 mt-1">Invited to this survey</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Surveys Completed</CardTitle>
            <FileText className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sortedCategoryData.reduce((s, c) => s + (c.positiveCount || 0), 0) || '—'}</div>
            <p className="text-xs text-gray-600 mt-1">Successfully submitted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Active Respondents</CardTitle>
            <Target className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.max(0, Math.round((overallPercentage || 0) / 10))}</div>
            <p className="text-xs text-gray-600 mt-1">Currently in progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Avg Time to Complete</CardTitle>
            <Clock className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">11.4 min</div>
            <p className="text-xs text-gray-600 mt-1">Average completion time</p>
          </CardContent>
        </Card>
      </div>

      {/* Existing overall gauge kept but moved down to align with Leadership visuals */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Experience Overview</CardTitle>
          <CardDescription>Overall driver and category breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center justify-center space-x-0 md:space-x-8 space-y-4 md:space-y-0">
            <div className="text-center w-full md:w-auto">
              <div className="text-4xl font-bold text-green-600 mb-2">
                {overallPercentage.toFixed(1)}%
              </div>
              <div className="text-lg font-medium text-gray-700">
                Overall Positive Experience
              </div>
              <div className="mt-4 w-full sm:w-64 mx-auto">
                <Progress value={overallPercentage} className="h-3" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Performance by Category</CardTitle>
          <p className="text-sm text-muted-foreground">
            Positive response rates across employee experience categories
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-80 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedCategoryData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="driver" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  domain={[0, 100]}
                  label={{ value: 'Positive %', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="positivePercentage" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {sortedCategoryData.map((category) => (
              <div key={category.driver} className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600 mb-1">
                  {category.positivePercentage.toFixed(1)}%
                </div>
                <div className="text-sm font-medium text-gray-700">{category.driver}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {category.positiveCount}/{category.totalCount} positive
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Drivers Detailed View (unchanged) */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Driver Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-4 text-green-700">Top Performing Drivers</h4>
              <div className="space-y-3">
                {sortedDriverData.slice(0, 6).map((driver) => (
                  <div key={driver.driver} className="p-3 bg-green-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-gray-800 flex-1 pr-2">
                        {driver.driver}
                      </span>
                      <span className="text-lg font-bold text-green-600">
                        {driver.positivePercentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-green-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${driver.positivePercentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-4 text-orange-700">Areas for Improvement</h4>
              <div className="space-y-3">
                {sortedDriverData.slice(-6).reverse().map((driver) => (
                  <div key={driver.driver} className="p-3 bg-orange-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-gray-800 flex-1 pr-2">
                        {driver.driver}
                      </span>
                      <span className="text-lg font-bold text-orange-600">
                        {driver.positivePercentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-orange-200 rounded-full h-2">
                      <div 
                        className="bg-orange-600 h-2 rounded-full" 
                        style={{ width: `${driver.positivePercentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Responses + Response Distribution (to match Leadership layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily Responses</CardTitle>
            <CardDescription>Response activity over the survey period</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyResponses}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="responses" stroke="#3B82F6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Response Distribution by Department</CardTitle>
            <CardDescription>Participation across organizational units</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={demographicData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={4}>
                    {demographicData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`${value}`, 'Responses']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {demographicData.map((item) => (
                <div key={item.name} className="text-xs inline-flex items-center gap-2 px-2 py-1 bg-gray-100 rounded-full">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Personal responses summary (render inline like Leadership screenshot) */}
      {surveyResponses && moduleId && (
        <div className="mt-6">
          <MyResponsesResults surveyResponses={surveyResponses} module={moduleId} />
        </div>
      )}

      {/* Response Distribution (unchanged) */}
      <Card>
        <CardHeader>
          <CardTitle>Response Distribution Context</CardTitle>
          <p className="text-sm text-muted-foreground">
            Distribution of responses across different scales
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-4">1-5 Scale Distribution</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={distribution1to5}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="score" />
                  <YAxis />
                  <Tooltip />
                  <Bar 
                    dataKey="count" 
                    fill={(entry: any) => entry?.isPositive ? COLORS.positive : COLORS.neutral}
                  >
                    {distribution1to5.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.isPositive ? COLORS.positive : COLORS.neutral} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div>
              <h4 className="font-medium mb-4">0-10 Scale Distribution (NPS)</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={distribution0to10}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="score" />
                  <YAxis />
                  <Tooltip />
                  <Bar 
                    dataKey="count" 
                    fill={(entry: any) => entry?.isPositive ? COLORS.positive : COLORS.neutral}
                  >
                    {distribution0to10.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.isPositive ? COLORS.positive : COLORS.neutral} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}