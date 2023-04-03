from aws_cdk import (
    Duration,
    Stack,
    aws_iam as iam,
    aws_ec2 as ec2,
    aws_rds as rds,
    aws_elasticloadbalancingv2 as elb,
    aws_elasticloadbalancingv2_targets as tg,
)
from constructs import Construct
​
class WebAppStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        ## set instance profile to use ssm
        instance_profile = iam.Role(self, "ec2_profile",
            assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"),
            description="for instance profile",
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("CloudWatchAgentServerPolicy"),
                iam.ManagedPolicy.from_aws_managed_policy_name("AmazonSSMManagedInstanceCore"),
            ]
        )
        
        ## VPC and VPC endpoints for ssm
        vpc = ec2.Vpc(self, "web-vpc",
            cidr="10.100.0.0/16",
            flow_logs={
                "traffic_type": ec2.FlowLogTrafficType.ALL
            },
            vpc_name="web_vpc",
        )
        ec2.InterfaceVpcEndpoint(self, "ssm_endpoint",
            vpc=vpc,
            service=ec2.InterfaceVpcEndpointAwsService("ssm")
        )
        ec2.InterfaceVpcEndpoint(self, "ssmmessage_endpoint",
            vpc=vpc,
            service=ec2.InterfaceVpcEndpointAwsService("ssmmessages")
        )
        
        
        ## EC2
        
        ec2_instance = ec2.Instance(self, "Web-ec2",
            vpc=vpc,
            instance_type=ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            machine_image=ec2.MachineImage.latest_amazon_linux(generation=ec2.AmazonLinuxGeneration.AMAZON_LINUX_2),
            instance_name="web-instance",
            key_name="  YOUR_KEY_NAME",
            block_devices=[ec2.BlockDevice(
                device_name="/dev/xvda",
                volume=ec2.BlockDeviceVolume.ebs(10)
                )
            ],
            role=instance_profile,
        )
        
        
        ## RDS
        db_instance = rds.DatabaseInstance(self, "web-rds",
            engine=rds.DatabaseInstanceEngine.mysql(version=rds.MysqlEngineVersion.VER_8_0_28),
            vpc=vpc,
        )
        
        ## ALB
        alb = elb.ApplicationLoadBalancer(self, "alb",
            vpc=vpc,
            internet_facing=True,
        )
        listener = alb.add_listener("listener", port=80)
        listener.add_targets("target",
            port=80,
            targets=[tg.InstanceIdTarget(instance_id=ec2_instance.instance_id)],
            health_check=elb.HealthCheck(
                path="/index.html",
            )
        )
        
        ## Define Connections
        ec2_instance.connections.allow_from(alb, ec2.Port.tcp(80))
        db_instance.connections.allow_from(ec2_instance, ec2.Port.tcp(3306))